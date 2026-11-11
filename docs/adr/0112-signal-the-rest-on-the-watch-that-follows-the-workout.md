# 0112. Signal the rest on the watch that follows the workout

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

ADR 0109 decided that the end of a rest is signalled on one device only: the watch while it follows the workout, the phone otherwise. The watch app shows the workout (ADR 0110, ADR 0111), but nothing yet says whether it follows it, and the phone still signals every rest. The approved design has the watch follow a workout started on it too, or one it joins from its own app.

## Decision

- **The workout says whether the watch follows it.** The session keeps `watchFollows`, which the state for the watch carries as `follows`. A new command, `join`, sets it; it can be sent again without harm. Starting a workout on the watch too, from the phone's start screen, sets it as well, in a pull request of its own.
- **A workout the watch does not follow offers to join.** Opening the watch app during it shows its name, its time and the sets done, and Join. Joining asks once for the watch's notifications.
- **The watch signals the rests of a workout it follows.** It schedules a local notification for the end of each rest it shows, replacing the one before, and removes it when the rest is skipped. A notification taps the wrist with the app closed or the wrist down, which a timer in the app could not. With the app open, it shows no notification: the app taps the wrist and shows that the rest is over, with the next set.
- **The phone leaves those rests to the watch.** While the watch follows the workout and is still paired with Benchbite on it, the phone schedules no rest notification and does not vibrate; it still ends the rest when it is over. The rest bar says that the watch alerts. Once the watch app is gone or the watch unpaired, the phone signals again.
- **The workout is named on the watch as the phone names it**, a planned workout without a name of its own by its type.

## Alternatives considered

- **A workout session on the watch (`HKWorkoutSession`) to keep the app running and tap the wrist from a timer:** it is needed for the heart rate, and comes with it, but a local notification signals the rest without it, also when the session cannot run.
- **Following every workout once the watch app is installed:** the watch would signal rests of workouts done without it, with the phone quiet, as when it lies charging.
- **Taking the alerts back when the watch is out of reach:** `isReachable` is false whenever the watch app is not in front, which is most of a workout; the phone would signal nearly every rest.

## Consequences

- A watch that stops talking, as when it is taken off or runs out of battery, still counts as following until it is unpaired or its app removed, and the phone stays quiet. ADR 0109's rule that the phone then takes the alerts back needs the watch to say it is there while the workout runs, which comes with its workout session.
- The watch's texts are in English until its translations follow.
- A local notification on the watch can be held back by the watch's own settings, such as a focus mode, which the phone's no longer covers.
