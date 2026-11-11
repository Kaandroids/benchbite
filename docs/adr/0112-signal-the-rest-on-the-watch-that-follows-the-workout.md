# 0112. Signal the rest on the watch that follows the workout

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

ADR 0109 decided that the end of a rest is signalled on one device only: the watch while it follows the workout, the phone otherwise. The watch app shows the workout (ADR 0110, ADR 0111), but nothing yet says whether it follows it, and the phone still signals every rest. The approved design has the watch follow a workout started on it too, or one it joins from its own app.

## Decision

- **The workout says whether the watch follows it.** The session keeps `watchFollows`, which the state for the watch carries as `follows`. A new command, `join`, sets it; it can be sent again without harm. Starting a workout on the watch too, from the phone's start screen, sets it as well, in a pull request of its own.
- **A workout the watch does not follow offers to join.** Opening the watch app during it shows its name, its time and the sets done, and Join. Joining needs the watch's notifications, which it asks for: without them the watch could not signal a rest with the app closed, so it does not join and says how to allow them.
- **A rest is signalled by the device that started or last changed it**, for now. ADR 0109 has the watch signal every rest while it follows the workout, but the watch app, suspended with the wrist down, hears nothing of the phone: the state it gets by application context waits until the app runs again. A rest started by a tick on the phone would then be signalled nowhere. So the rest keeps `byWatch` when a command from the watch started or last changed it, and loses it when the phone changes it. The rule of ADR 0109 comes back with the watch's workout session, which keeps the app running and hearing the phone.
- **The watch signals its rests at once.** A tick on the watch reckons the rest it starts from the exercise's rest and the command's own time, as the phone does, and the set after it; it shows the rest and schedules a local notification for its end before the phone answers, which may only arrive once the app runs again. The phone's state then corrects it, and a change of the rest made meanwhile is of the rest the phone then has. A notification taps the wrist with the app closed or the wrist down, which a timer in the app could not. With the app open, it shows no notification: the app taps the wrist and shows that the rest is over, with the next set. A rest the phone ends by its own clock a moment before the watch's is still signalled.
- **The phone leaves those rests to the watch.** While the watch follows the workout, the rest is the watch's, and the watch is still paired with Benchbite on it, the phone schedules no rest notification and does not vibrate; it still ends the rest when it is over. The rest bar says that the watch alerts. The phone's module removes a notification the phone scheduled only for a command that takes the rest, which the watch marks beside it, as JavaScript may be asleep; each command applied then checks the rest again, so that one the phone keeps, as when the command was refused, is signalled after all. Once the watch app is gone or the watch unpaired, the phone signals again.
- **The workout is named on the watch as the phone names it**, a planned workout without a name of its own by its type.

## Alternatives considered

- **A workout session on the watch (`HKWorkoutSession`) to keep the app running and tap the wrist from a timer:** it is needed for the heart rate, and comes with it, but a local notification signals the rest without it, also when the session cannot run.
- **Following every workout once the watch app is installed:** the watch would signal rests of workouts done without it, with the phone quiet, as when it lies charging.
- **Taking the alerts back when the watch is out of reach:** `isReachable` is false whenever the watch app is not in front, which is most of a workout; the phone would signal nearly every rest.

## Consequences

- A watch that stops talking, as when it is taken off or runs out of battery, still signals the rests it started, which no device then signals. ADR 0109's rule that the phone then takes the alerts back needs the watch to say it is there while the workout runs, which comes with its workout session.
- A rest changed on the phone while the watch app is suspended is signalled by the phone, and the watch, not hearing of the change, also taps the wrist at the rest's earlier end.
- The watch's texts are in English until its translations follow.
- A local notification on the watch can be held back by the watch's own settings, such as a focus mode, which the phone's no longer covers.
