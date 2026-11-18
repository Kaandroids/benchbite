# 0145. Start the onboarding again when the profile is gone

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

Withdrawing the health data consent deletes the profile, the plan and every log on the server
(ADR 0144), and the user starts the onboarding again. The device that withdrew it knows at once.
Another phone signed in to the same account does not: it keeps the onboarding marked finished, its
workout in progress, its reminders for the deleted plan and its connection to the health store,
which imports again whenever the app comes to the front. The server refuses those writes (BB063),
but the phone would stay on empty screens.

ADR 0144 said the app would treat BB063 as a withdrawn consent. This records what it does instead.

## Decision

- **The profile check runs whenever the app comes to the front**, not only until its first answer.
  A finished onboarding whose profile is gone starts again. Only the first answer since the
  onboarding last started may finish it, so that restarting it from the gallery still sticks and an
  onboarding finished again on another phone finishes it here too.
- **Starting again forgets what the device keeps for its user**, as when another user signs in
  (ADR 0031, ADR 0108): the workout in progress, how workouts ended, the reminders and the
  connection to the health store, which the user connects again with their own consent. The query
  cache is cleared, so that nothing of before shows.
- **The device that withdraws** starts again as soon as the server confirms. A consent withdrawn
  already, as on another phone (BB060, BB062), counts as withdrawn.
- **Which consents hold is the server's to say:** `my_consents()` answers with the rule of
  `has_health_consent()` and `has_ai_consent()`, so that the app keeps no copy of it.

## Alternatives considered

- **React to BB063 from a write.** A phone that writes nothing, or only reads, would stay on empty
  screens, and each place that writes would need to handle it.
- **Keep the health store connected.** The user withdrew the consent to exactly that data; reading
  it again after the new onboarding, without asking, would go against it.

## Consequences

- Each return to the front costs one small read of the profile.
- A user who starts again sets their reminders and the health connection again.
- The website's withdrawal (#653) reaches the phones the same way.
