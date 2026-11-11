# 0113. Run a workout session on the watch

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

The watch follows a workout run on the phone (ADR 0109, ADR 0112), but its app is suspended as soon as the wrist goes down: it measures nothing, and hears nothing of the phone until it runs again. ADR 0109 has the watch's workout session write the heart rate and the calories to Apple Health, where the phone reads them (ADR 0097, ADR 0104), and the approved design shows the heart rate on the watch. The phone can already save its own workouts to Apple Health, when the user turns that on (ADR 0105), and it leaves out a workout another app recorded at the same time, as a watch's.

## Decision

- **The watch runs a workout session for the workout it follows**, from joining it until the phone ends it: an `HKWorkoutSession` of strength training, indoors, with an `HKLiveWorkoutBuilder` that collects the heart rate and the active calories. It starts at the phone's start, so that it covers the log's time. The heart rate shows on the set and rest screens.
- **The phone says how the workout ended.** The session store keeps the latest ended workout, saved with the time its log ends or let go, and the state for the watch carries it as `ended`, by the workout's id, after the workout is gone and while a next one starts.
- **The watch saves its workout when the phone saves the log**, to the log's end, and always: the user chose that a workout followed on the watch goes to Apple Health with its heart rate and calories, as a watch's workout app does, whatever the phone's own saving (ADR 0105) is set to. A workout the phone lets go of, discarded or ended when another user signs in, is left out.
- **Asked when joining.** Join asks for the watch's notifications first (ADR 0112), then for saving workouts with their calories and heart rate and for reading them. Joining goes on without the health store; the session then measures nothing. A workout joined before the watch measured asks when its session starts.
- **A session the system kept going** while the app was ended is taken up again at launch, with the workout's id kept on the watch.

## Alternatives considered

- **Saving the watch's workout only while the phone saves its own:** the switch is off by default, and a workout followed on the watch would then reach no Activity ring; whether the heart rate measured during a discarded workout stays in the store is not documented.
- **The phone saving one workout with the watch's heart rate:** the phone cannot write the watch's samples as the watch's, and its copy would not count as the watch's in Activity.
- **A session without a builder:** it keeps the app running, but saves no workout to tie the heart rate and calories to.

## Consequences

- With a workout followed on the watch, Apple Health has the watch's workout, from Benchbite on the watch; the phone does not save a second one, and does not list it among other apps' workouts, as it covers the log's time (ADR 0105, ADR 0106). Its log shows the watch's heart rate and calories.
- The watch's app keeps running during the workout, which ADR 0112's rule that the device that started a rest signals it was waiting for; going back to ADR 0109's rule, with the phone taking the alerts back when the watch stops talking, follows in its own pull request.
- The watch target has HealthKit's entitlement, the workout processing background mode and the texts of its Health prompts, in English until its translations follow.
