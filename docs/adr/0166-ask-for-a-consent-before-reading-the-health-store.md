# 0166. Ask for a consent before reading the health store

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

Connecting Apple Health or Health Connect (ADR 0097) opened a sheet that listed what Benchbite
reads and keeps, with a Continue button, and then the system's own dialog. Neither said what the
data is used for, and nothing was recorded. The system's dialog names neither Benchbite's purposes
nor its privacy policy, so it is not a consent in the sense of GDPR Art. 9(2)(a) and Art. 7(1):
explicit, informed, for named purposes, and provable (#711).

The health data consent of the onboarding covers what the user enters and logs. Heart rate, calories,
weight, steps and other apps' workouts read from the store come from another source, are read
in the background, and stop when the user disconnects, so they are asked for on their own.

This amends the part of ADR 0097 about the consent before the system's own screen, and adds the
consent to read the store to what withdrawing the health data consent ends (ADR 0144).

## Decision

- The sheet says what is read, what it is used for and what is kept, with a sentence that agreeing
  allows Benchbite to process this health data for these purposes and a link to the privacy policy.
  Its button reads "Agree and continue"; "Not now" asks nothing.
- Agreeing records the consent on the server (`give_health_app_consent()`) with the store and the
  version of the sheet's text, before the system asks. A consent that was not recorded asks
  nothing, and one the system then refuses ends again. It rests on the health data consent:
  without that one it is refused.
- Disconnecting, or the system taking the access back, records the end of it
  (`withdraw_health_app_consent()`). Withdrawing the health data consent ends it too. What was
  read is not deleted on disconnecting: it is part of the logs under the health data consent.
- Like the other consents, entries are only added, never changed, and are part of the data export.
- The consent is the account's, not a phone's: disconnecting on one phone ends it, and the
  others let go of their connection when the app starts or comes to the front, where the consent
  is checked. This also lets go of a connection made before the consent was asked for; the user
  connects again through the sheet. Without an answer, as offline, reading goes on, so that a
  workout keeps its heart rate.

## Alternatives considered

- **A box to tick, as in the onboarding.** Rejected in the mock-up: a clearly worded button is an
  explicit act on its own. The onboarding needs boxes because it asks for two things at once.
- **Count the onboarding's consent as covering the store.** Its text names what the user enters,
  not what is read from another app, and the source and the way out differ.
- **Make it one of the agreements the server versions (ADR 0156).** That would ask every connected
  user again whenever the text changes. A change of this text is rare, and the version recorded
  with each consent shows which one was given; it can become one later if needed.

## Consequences

- Each connection is provable, with the text's version and the time, and so is its end.
- Connecting needs a connection to the server; offline it fails with "Try again".
- Users who connected before this build must connect again once. There are no real users yet.
- A user who reads on two phones and disconnects one must connect the other again. A consent per
  phone would avoid that, at the cost of an identity for each phone, for a case that is rare.
- Each start and return to the front asks the server once more.
- Ending the consent is recorded as best it can be: reading stops on the device even when the
  record fails, and the next connection records a new consent.
