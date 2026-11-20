# 0159. Ask for the consents again where they are needed

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

ADR 0158 decided that the consents are asked again when their text changes, as the terms are,
with no "Later" and with declining leading to the withdrawal. It left open how each of the two
consents is asked (#690), and what the device keeps to ask in time.

The two consents differ. The app cannot hold a user's profile, plan or logs without the consent
to process health data, so that consent is needed as long as the app is used at all. The consent
to the AI features is needed only when Bite or a meal photo sends something to the provider;
many users never use either.

A consent's wording, unlike the terms, is shown in the app itself: what is collected and what
for. A build shows the wording it was made with.

## Decision

- **The health data consent is asked in place of the app,** when the server's version of its
  text differs from the one the user consented to last, once they finished the onboarding. The
  screen says what is collected and what for, what changed as the version's summary, and has the
  box to tick beside the privacy policy to read. There is no "Later", also before the day the
  text applies.
- **"I don't agree" opens the withdrawal the settings offer** (ADR 0145): what is deleted, the
  export, and only then the button that withdraws. Withdrawn, the onboarding starts again.
- **`give_health_consent(version)` records the renewal,** in the history the onboarding writes
  to. It takes only the current version (`BB066`) and only from a user whose consent holds; after
  a withdrawal the onboarding asks from the start.
- **The AI consent is asked again at the next use.** `ai_access()` answers `consent_required`
  when the user's latest consent was given to another version than the current one, so Bite and
  meals from photos show the consent screen of the first use (ADR 0142) before anything is sent.
  What rests on the consent stays, and it can still be withdrawn in the settings.
- **When both the terms and the health data consent changed, the terms are asked first.**
- **The device keeps the version a user agreed to last,** of the terms and of the health data
  consent, per user and as the server last said it, so that the question shows in the first
  render and not a moment after the app. The server is asked all the same and its answer counts;
  when it cannot be asked, the kept version holds nobody and the app opens (ADR 0158). The kept
  versions are forgotten with what else the device keeps for its user.
- **A new wording ships with a build.** The row for a new version of a consent is added once the
  build that shows the new wording is in the stores, and builds below it are declared
  unsupported (ADR 0157), so that nobody consents to a version whose wording they were not shown.

## Alternatives considered

- **The AI consent in place of the app too:** one way for all three texts, but it stops users
  who never use the AI features for a consent they do not need.
- **Counting an AI consent to an older text as none:** one rule fewer in `ai_access()`, but the
  settings would show the consent as not given while Bite's chats rest on it, and it could not
  be withdrawn.
- **The consent's wording from the server:** no build to wait for, but a second place for copy,
  outside the translations and their checks.
- **"Later" for the health data consent until its day:** kinder, but the text applies to data
  the app keeps handling in the meantime.

## Consequences

- A change to the health data consent stops every user at their next start until they answer;
  it is for changes of substance, not of wording alone.
- A new AI consent text closes Bite and meal photos for each user until they consent again, at
  the moment they next use them.
- Changing a consent's wording takes a release and a raise of the lowest supported version,
  besides the row.
- Database tests that give an AI consent name the current version, not a made-up one.
