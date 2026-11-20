# 0155. Declare encryption and data use to Apple in the app config

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

Apple asks two things of every build it takes (#559). Whether the app uses encryption beyond what
is exempt from export rules: unanswered in the build, App Store Connect asks with each upload. And
a privacy manifest: the reasons the app uses certain system APIs, the data it collects, and whether
it tracks. A build that uses such an API without a declared reason is refused.

The app's manifest came from Expo's defaults: three API reasons and no collected data, though the
app collects health data, an email address, photos and voice messages, and sends error reports.
The libraries bring manifests of their own, but Apple does not read every manifest of a statically
linked pod, so what the app's own says has to cover them. The watch app had none.

## Decision

- **`ios.config.usesNonExemptEncryption` is false** in `app.json`: the app only uses the system's
  HTTPS and what the system itself encrypts.
- **The phone app's manifest is written in `app.json`** (`ios.privacyManifests`), from which Expo
  makes `PrivacyInfo.xcprivacy`:
  - **API reasons,** the app's own and its libraries': its own defaults (CA92.1), timestamps of
    files in its container (C617.1), the boot time for measuring time between events (35F9.1) and
    free disk space before writing (E174.1), which `expo-file-system` declares and the defaults
    left out. Reasons a library lists for uses the app does not make are left out: files the user
    picks from outside the app (3B52.1), showing free space to the user (85F4.1), and the reason
    meant for SDKs only (0A2A.1).
  - **Collected data,** each for the app's own working only and none for tracking: health and
    fitness, name, email address, user id, photos, audio, other content the user writes, and
    other usage data, linked to the account. Sex and birth year count under health, as the
    calorie targets come from them; other usage data is what each request to the AI used, kept
    per user for the allowance. Then crash data and other diagnostic data, not linked: JavaScript
    errors are scrubbed on the phone, and native crashes by Sentry's rules as they arrive, before
    they are stored (ADR 0149). The declaration depends on those rules staying in place.
  - **No tracking,** and no tracking domains.
- **The watch app has a manifest of its own** (`targets/watch/PrivacyInfo.xcprivacy`), which the
  target takes with its other files: its own defaults, and health and fitness data.
- **Three texts say the same:** the manifest, the privacy policy, and the stores' privacy
  details (#552). A change to what the app collects changes all three.

## Alternatives considered

- **Answering the encryption question in App Store Connect with each upload:** no code, but a
  question at every build, and TestFlight waits for the answer.
- **Leaving the manifest to Expo's defaults and the libraries' own:** nothing to maintain, but the
  collected data would stay empty, and a reason a static library needs may go unread.
- **Copying every reason every library lists:** safe against a refusal, but it declares uses the
  app does not make.

## Consequences

- A new library with native code may need a reason added here: look for its
  `PrivacyInfo.xcprivacy` after `pnpm expo prebuild`.
- Purchases will add purchase history to the collected data (#434).
- Whether Apple accepts the manifest shows only with an upload to App Store Connect, which has
  not been made yet.
