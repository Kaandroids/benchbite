# 0149. Report crashes and errors to Sentry

- **Status:** Accepted, amended by ADR-0161
- **Date:** 2026-11-20

## Context

Nothing tells us when the app fails for someone. There is no error boundary, so an error while a
screen renders leaves it blank; errors are written to `console.warn`, which nobody reads in a
release build, or swallowed; and the stores count native crashes without saying where they
happened (#550). Benchbite handles health data, so whatever reports errors must not carry it: an
error's message can hold a weight, a meal or what someone said to Bite.

## Decision

- **Sentry, in its EU region** (`de.sentry.io`, Frankfurt), through `@sentry/react-native` with its
  Expo plugin and Metro config. It catches JavaScript errors, unhandled promise rejections and
  native crashes in one place, and reads release builds' stack traces through their source maps
  and debug symbols. The organization is `benchbite`, the project `benchbite-app`; the Edge
  Functions will get a project of their own (#556).
- **Errors and crashes only.** No tracing, logs, Session Replay, screenshots or view hierarchy,
  each of which could show what someone logged. They are turned off in `Sentry.init` as well as
  by default, so that an SDK update cannot turn them on.
- **JavaScript errors are scrubbed on the phone** (`src/lib/reporting.ts`):
  - `sendDefaultPii` is off: no IP address, user or route parameters.
  - `beforeSend` drops the user, the request, extra data and the device's name ("Kaan's iPhone"),
    and masks in messages addresses, tokens, ids and every number on its own, keeping the app's
    error codes (BB063).
  - `beforeBreadcrumb` keeps of a breadcrumb only its kind, level and time; of a request its
    method, the path of its URL and its status; of a navigation its paths without query. What was
    logged, typed or tapped is dropped.
  - It drops the hash that stays the same for a phone (`device_app_hash`), which would tell one
    person's errors apart.
  - Tests show that a realistic event keeps none of these.
- **Native crashes are scrubbed by Sentry.** The native SDK sends its crashes, hangs and the
  system's kills of the app without `beforeSend`, with the installation's id as the user, the
  device's hash and name, and its own breadcrumbs. The project's advanced data scrubbing rules
  remove the user, `device_app_hash` and `device.name` from every event as it arrives, before it is
  stored; their exception text, which is the system's, is not masked.
- **Sentry keeps none of it.** The project prevents storing IP addresses, keeps its server side
  data scrubbing on, and also removes `user.geo`, the city Sentry otherwise works out from the IP.
  A test error from a development build showed each of these working.
- **No sessions.** Sessions would give the share of them without a crash, but carry the
  installation's id, which no rule removes; the App Store and Google Play report crash rates
  without it.
- **The DSN is in the app, the auth token is not.** `EXPO_PUBLIC_SENTRY_DSN` only lets the app send
  events to the project, and every copy of the app needs it. `SENTRY_AUTH_TOKEN`, which uploads
  source maps and debug symbols at build time, is a secret kept on the build machine
  (`.env.local`, later EAS), never in the repository or the app.
- **A development build reports nothing** unless `EXPO_PUBLIC_SENTRY_IN_DEV=1`, to try the setup,
  under the `development` environment; release builds report under `production`.
- **Tests never reach Sentry:** a stand-in replaces the SDK in every test.

## Alternatives considered

- **Firebase Crashlytics:** free, but brings Firebase and Google's SDKs into the app, reads
  JavaScript errors less well, and has no EU data region.
- **Bugsnag:** similar to Sentry, with a smaller free plan.
- **GlitchTip, hosted by us:** Sentry-compatible and ours, but one more service to run and secure.
- **Sending more, such as tracing or replay, scrubbed:** each sends what is on screen or in a
  request, which scrubbing can miss; slow screens can be looked at later, with their own decision.

## Consequences

- Sentry is a processor of the app's crash data: the privacy policy names it, with its purpose, and
  a data processing agreement is in place. The lawyer is asked whether legitimate interest
  (Art. 6(1)(f) GDPR) covers it without consent.
- Masking every number makes some messages less telling, as a count or a status in the text; the
  stack trace and the error's type still say where it failed.
- `@sentry/react-native` is a native module: the app needs a new development build.
- The stores' privacy declarations (#552) list crash and diagnostic data, not linked to the person.
