# 0114. Signal the rest on the watch while it is heard

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

ADR 0109 has the watch signal every rest while it follows the workout, and the phone take the alerts back when the watch stops talking. ADR 0112 could do neither: the watch app was suspended with the wrist down and heard nothing of the phone, so a rest was signalled by the device that started or last changed it, and a watch that stopped talking still kept the rests it started. ADR 0113 runs a workout session on the watch, which keeps its app running and hearing the phone for the whole workout.

## Decision

- **The watch says it is there, and which rest it signals.** While its workout session measures the workout, the watch sends the phone a sign (`["here": workoutId, "rest": endsAt]`), with the end of the rest it signals, if any, every 30 seconds and at once when that rest changes, by message, and only while the phone can be reached: a sign that waited would say nothing of the time it arrives. A command from the watch is no sign, as it says nothing of whether the watch measures, and may have waited. A sign is about one workout: the phone forgets it once it runs another.
- **The watch signals every rest of the workout it measures**, started on the phone or on the watch, as ADR 0109 has it, with the notification and the rest-over screen of ADR 0112. The app does so whether a view shows, as when the system launches it in the background to recover its session.
- **The phone keeps its notification as a stand-in, which the watch link's module alone schedules on iOS.** JavaScript tells the module the rest to signal, or none, whoever started it; the module, which runs even when JavaScript does not, keeps that rest, the watch's latest sign and the notification on one queue, so that none undoes another. It schedules the notification when the rest ends; while the watch signals that same rest, once the time the watch is heard for is up at the earliest; and it drops it once the watch was heard signalling it past its end. A sign of another rest, as one the watch has not heard of yet, changes nothing of it. The module tells JavaScript until when the watch is taken to be there, and the rest it signals (`heardUntil`, `heardRest`). The 75 seconds are over twice the time between signs, so one sign may be lost. Where there is no watch link, as on Android, the app schedules the notification itself as before.
- **The phone takes the alerts back once the watch is not heard for 75 seconds.** Its notification then comes when it is due, or at most 75 seconds after the watch was last heard, if the rest ended in between. While the watch is heard signalling the rest, the phone does not vibrate when it ends, and the rest bar says that the watch alerts.
- **Which device a rest belongs to is no longer kept.** Whether the watch is heard decides, so the rest's `byWatch` of ADR 0112, and the mark beside the watch's commands that took the phone's notification away, are gone.

ADR 0109 is followed again, and ADR 0112's rule of the device that started or changed the rest is replaced.

## Alternatives considered

- **The phone schedules nothing while the watch is heard, as in ADR 0112:** with the phone locked, its JavaScript does not run, so it could not take the alerts back when the watch stops; a stand-in that the module puts off needs nothing of JavaScript.
- **Taking the alerts back by `isReachable`:** it says whether the phone can reach the watch app now, not whether the watch is on the wrist and measuring; and a reachable watch that crashed would still keep them.
- **A shorter time than 75 seconds:** the phone's alert would come sooner after the watch stops, but a sign or two delayed would bring a second alert while the watch is there.

## Consequences

- With the watch on the wrist and measuring, every rest is signalled once, on the watch. With the watch taken off, out of battery or out of reach, the phone signals the rests, at most 75 seconds late for one ending just after the watch stopped.
- A watch whose workout session cannot run, as without the health store's permission, sends no sign: the phone then signals every rest, and the watch none.
- The watch's signs cost a message every 30 seconds during a workout, which its session keeps it awake for anyway.
