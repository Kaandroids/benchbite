# 0011. Guide new users through an onboarding flow kept on the device until it is finished

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

New users answer about twenty questions, one per screen, before they can use the app. People
are interrupted, close the app or go back to change an answer, and the answers must survive
all of that. Writing every answer to Supabase as it is given would leave partial profiles and
repeated writes, and the guest account (ADR 0005) exists from the first launch, so the app has
to decide on every start whether to show the onboarding or the app.

## Decision

- **Route protection:** the root stack wraps the onboarding and the app in `Stack.Protected`.
  Until the onboarding is finished, only the onboarding is reachable; finishing it switches to
  the app and removes the onboarding from the history.
- **One dynamic route:** every step is `/onboarding/[step]`. The steps, their order and which
  ones apply to the answers so far are defined once, in `src/onboarding/steps.ts`; each step
  still opens as a screen of its own, with the native transition and back gesture.
- **Draft on the device:** the answers and the current step are saved to expo-sqlite's
  key-value store after every change and restored on the next launch, so an interrupted
  onboarding resumes on the same screen. The draft carries a version, so an outdated one is
  discarded. Nothing is written to Supabase until the last step (#19).
- **Finished or not:** the server's `profiles.onboarding_completed_at` decides, and a copy on
  the device answers immediately and while offline. The copy lets the app choose its first
  screen without waiting; the server lets someone who finished on another device skip it.
- **Progress:** measured against every step, including those that may be skipped, so the total
  never grows and skipping moves the bar further.
- **State:** a React context, `OnboardingProvider`, rather than a state library, as one flow
  does not need more.

## Alternatives considered

- **Saving each answer to Supabase:** survives reinstalls, but leaves partial profiles and
  writes on every back and forth, and needs a connection on every step.
- **A route file per step:** each step's screen is easy to find, but the order and the
  conditions would be spread over twenty files.
- **A single screen with an internal step counter:** simple, but loses native transitions,
  the back gesture and the Android back button.

## Consequences

- Clearing the app's data or reinstalling loses an unfinished onboarding, which also loses the
  guest account, so nothing else is lost with it.
- Going back after resuming opens the previous step with a replace instead of a back
  navigation, because the earlier steps are not in the history.
- The question order can change between releases; raising the draft version discards
  unfinished drafts that no longer fit.
