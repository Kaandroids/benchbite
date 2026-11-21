# 0161. Build the app with scripts in the repository

- **Status:** Accepted
- **Date:** 2026-11-21

## Context

A release build of the app was made by hand: a page of steps in `docs/deployment.md`, with the
variant, the environment, the signing team and the Sentry token each to be remembered. Every one
of them went wrong at least once: an app built from the development environment file opened and
could not connect; a build stopped at Sentry's upload for want of its token; a fresh `ios/` had
no signing team; a build went to the wrong of two phones.

Expo's own answer is EAS Build with EAS Update. The project decided against updates over the air
(ADR 0156), and against the build service with them: builds are made on the maintainer's Mac,
with the membership and the tools already there, and no third party holds the signing keys or
the source. Three earlier records planned for EAS and are amended by this one: ADR 0001 named
it for builds and store submission, ADR 0096 left the builds for preview and production to it and named `pnpm native:release`,
whose work the release command does itself now,
and ADR 0149 expected Sentry's token to move there.

## Decision

- **A build is one command of the repository,** a script under `scripts/` that does the steps
  and checks them, started with `pnpm`.
- **`pnpm build:ios:release`** builds Benchbite itself against the hosted project and installs
  it on a connected iPhone. It:
  - reads the hosted project from `.env.production.local`, as Expo reads it, and stops at a
    missing file, an address that is not a hosted project's over https, or a key that is not the
    publishable one, so that a secret key cannot be built into the app;
  - picks the one real iPhone that is connected, asks for `--device` when there are more, and
    stops before building when the one named is not connected;
  - generates `ios/` anew for the release (`APP_VARIANT=production`), and signs with the team
    `app.json` names;
  - gives Sentry's build step its token from `.env.local`, and that variable alone, as the rest
    of that file names the local stack; without a token it turns the upload off;
  - checks that the built app names the hosted project's server before it installs.
- **No build service and no `eas.json`.** The stores are uploaded to by hand.
- **Other builds get a command of their own when they are needed:** the archive for the App
  Store with the rule for build numbers (#167), and Android after the first release on iOS.

## Alternatives considered

- **EAS Build:** no Mac needed and credentials kept for the project, but a service to pay for
  and to trust with the keys, for one maintainer who has a Mac.
- **Fastlane:** made for this, with lanes for signing and upload; a Ruby toolchain and its own
  conventions for what is a page of shell today.
- **The steps in the documentation, as before:** nothing to maintain, but every step is one to
  get wrong, and each mistake costs a build of some minutes.

## Consequences

- A release build needs a Mac with Xcode and the project's Apple developer team.
- The script is not run by CI, which has no iPhone and no signing; a native build in CI is its
  own work (#699).
- The script leaves `ios/` generated for the release: `pnpm native:dev` comes before the next
  development build, as before.
- #561, updates over the air with EAS Update, is closed as not planned.
