# 0151. Report the errors the app catches

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

Sentry hears of what the app does not catch, and of what a route's error boundary catches
(ADR 0149, ADR 0150). Most failures are neither: the app catches them, shows its own message or
goes on, and wrote them to `console.warn`, which nobody reads in a release build (#550). A request
that fails shows "could not load" and is gone.

## Decision

- **`reportError(where, error)`** in `src/lib/reporting.ts` takes the place of `console.warn` for
  errors. In development it writes to the console as before; when reporting is on it sends the
  error to Sentry with `where`, what failed in the app's words, as a tag. It goes through the same
  scrubbing as every event, and `where` is masked too, as it can name a stored key.
- **The query client reports every request that fails:** its query and mutation caches call
  `reportError`. A query is named by the first part of its key. A mutation names itself with
  `meta: { where: 'Could not save the workout' }`, which a lint rule asks every `useMutation` for:
  Supabase's errors carry no stack to their origin, so the name is what tells where one came from.
- **What the app expects is not sent:** no network or a request given up, a session that ended,
  and the refusals a screen explains to the person: the database's with the app's own codes (BB…),
  Auth's of what was typed (4xx), and the account's wrong password and refused codes, which say so
  themselves. A server's failure (5xx) is sent. They would bury the errors that are bugs.
- **Postgres's own refusals are expected only where a mutation says so,** with
  `meta: { expects: ['uniqueViolation'] }`: a name already used is no bug when saving a food or a
  recipe, nor a row gone for an alternative, but either is one anywhere else.
- **An error is sent once,** though it is caught where it happened and by the query client.
- **Supabase's errors are plain objects;** they are sent as an `Error` with their message, named
  by their code, without their details and hint, which can hold a row's values.

## Alternatives considered

- **Sending every warning:** the app warns of much that is no bug, as being offline; the reports
  that matter would be lost among them, and the plan's events used up.
- **Sentry's console integration,** which records what is logged: it would send the texts of
  warnings, which can hold what someone logged.
- **Reporting only where the code asks:** a request failing in a screen that forgot to ask would
  never be heard of; the query client hears of all.

## Consequences

- A new kind of expected failure must be added to `isExpected()` or to its mutation's `expects`,
  or it is reported.
- Two warnings stay `console.warn`: messages from the watch that are no commands, which are no
  errors.
