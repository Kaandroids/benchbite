# 0156. Keep what a build holds to on the server

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

The app is released through the stores alone: builds are made on the maintainer's Mac and no
update is shipped over the air, so that no third party stands between the app and its users, and
a faulty update cannot reach everyone at once. A fix therefore reaches a user only when they
install a new version, and builds with automatic updates off stay in use for months.

Until now, what a build holds to was written into it: the versions of the terms, of the privacy
policy behind the health data consent and of the AI consent were constants in the app, and
nothing said which versions of the app are still supported. None of these could change without a
release, and an old build would keep its old values for good (#688).

## Decision

- **The server holds them,** in two tables that change with an update to a row, without a deploy
  or a release:
  - `supported_app_versions`: the lowest supported version of the app on each platform.
  - `agreement_versions`: each version of a text a user agrees to (terms, health data consent, AI
    consent) with the day it applies and, by language, a short summary of what changed. A new
    version is a new row; a day in the future announces it ahead.
- **The app asks with `app_requirements(platform, app_version)`** once it has a session, when it
  opens and each time it returns to the foreground. The answer says whether the build is
  supported, the lowest version that is, and each text's current version.
- **The current version of a text is its latest, also before it applies.** A new user accepts
  what is announced, so that they are not asked again weeks later.
- **The check fails open.** Without an answer the app goes on with the texts' versions of the
  last one, kept on the device, or with those it was built with; a version the server cannot read
  counts as supported, and so does a build until this same version was told otherwise, as an
  answer kept from before an update says nothing of the new build. Locking users out by mistake
  is worse than an old build running a little longer.
- **Only a client with a session asks.** The function runs with its owner's rights, and such a
  function is never open to a signed-out client (ADR 0126); a guest has a session too.
- **The app's constants only stand in.** ADR 0141 and ADR 0142 named the versions of the terms
  and of the AI consent by constants in the app; the server names them now, and the constants,
  kept together in `src/requirements/built-with.ts`, hold only until it has answered.
- **Nothing is shown by this.** The screen that stops an unsupported build (#687) and the ones
  that ask again for the terms and the consents (#689, #690) build on it. The onboarding and the
  AI consent already record the server's current versions.

## Alternatives considered

- **Updates over the air:** a fix within hours, without a store review; but the update server
  would see every user's IP address, and a bad update reaches all users at once.
- **The versions in the app, as before:** nothing to read at the start, but every change of a
  text needs a release, and old builds never learn of it.
- **A remote config service:** made for this, but one more processor for a few rows.
- **Open to signed-out clients:** the app could ask before its sign-in; it gains nothing, as the
  app signs in as a guest at its start, and without a session nothing else works either.

## Consequences

- Raising a version or a text takes effect at the next start of every build that knows this
  check; builds older than it never ask, so it has to be in the first store release.
- The first start of an app offline knows only the versions it was built with.
- Backend changes have to stay compatible with every version at or above the lowest supported
  one; raising that value is how compatibility with older builds ends (#687).
- The server does not check yet that a recorded acceptance names a current version; the app
  sends the one it was told.
