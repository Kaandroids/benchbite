# 0157. Refuse unsupported builds on the backend

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

A build below the lowest supported version shows "Update Benchbite" in place of the app
(ADR 0156, #687). That screen is the app's own: a build that has not asked the server yet, one
that kept running in the foreground, or one made to skip the screen goes on reading and writing.
A version is declared unsupported because it has a serious fault or because the backend no longer
fits it, so its requests are exactly the ones that should not arrive.

The reverse holds for every other build: as long as a version is supported, the backend has to
keep working for it. Nothing said so yet.

## Decision

- **The app names its build in every request,** in two headers: `x-app-platform` and
  `x-app-version`.
- **The Data API checks them before each request.** `check_app_version()` is set as PostgREST's
  pre-request function. It refuses a signed-in request whose version is below the lowest
  supported one on its platform, with `426 Upgrade Required` and the code `BB064`.
- **The check refuses only what it is sure of.** It runs before every request, so a fault in it
  would stop the whole app. A request without the headers, with a platform or version it cannot
  read, from the service role or without a session passes, and so does any error within the
  check itself. It runs with the caller's rights and reads the table through one small function.
- **`app_requirements()` is exempt,** so that a refused build still learns that it has to update.
- **The Edge Functions that work for the app check too:** `coach-chat`, `estimate-meal` and
  `generate-plan` answer `426` with `unsupported_version`, by the same rule and as open to
  failure. Every function the app calls as a signed-in user wraps its handler in `supportedOnly`,
  except those for deleting the account, which stays possible from any build.
- **The app answers a refusal by asking what it has to hold to again,** whose answer puts the
  update screen in its place. Every response of its requests is looked at for the status 426,
  whichever request met it: those of the client, and those to an Edge Function through
  `postFunction`, which a new call of a function uses. The refusal is not reported as an error.
- **One rule says what is supported:** `app_requirements()` takes its answer from the function
  the check refuses by.
- **Backend changes stay compatible with every supported version.** A migration or an Edge
  Function may not break a build at or above the lowest supported version: columns and functions
  an old build uses stay, with their meaning, and new ones are added beside them. Compatibility
  with older builds ends only by raising the lowest supported version, once the newer build is in
  the stores.

## Alternatives considered

- **The screen alone:** enough for an honest build that asked; it does nothing for one that has
  not, and leaves a faulty version writing until its next start.
- **The check within each table's policies or each function:** no single point that every request
  passes, and a forgotten one stays open.
- **A gateway in front of the API:** one more service to run and to trust for two headers.
- **Refusing requests without the headers:** closes the way around the check, but the headers
  prove nothing: whoever changes a build can also send another version. The check is there to
  stop faulty builds, not to keep people out, which row level security does.
- **Auth and Storage too:** they do not pass through the Data API. A refused build can still sign
  in, which it needs in order to ask, but reads and writes no data.

## Consequences

- Every request to the Data API runs one more small function, a lookup in a table of two rows.
- Dropping or renaming `check_app_version()` while it is configured fails every request: a
  migration that changes it resets `pgrst.db_pre_request` in the same step. The database tests
  check that the setting names a function every request role can run.
- A build that names no version is never refused; the first store release has to carry the
  headers, as it has to carry the question of ADR 0156.
- The request that meets the refusal still fails with its own error for a moment, until the
  answer to the app's question puts the update screen in its place.
- The Edge Functions' check is one more request to the database before their work starts.
