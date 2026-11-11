# 0114. Signal the rest on the watch while it is heard

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

ADR 0109 has the watch signal every rest while it follows the workout, and the phone take the alerts back when the watch stops talking. ADR 0112 could do neither: the watch app was suspended with the wrist down and heard nothing of the phone, so a rest was signalled by the device that started or last changed it, and a watch that stopped talking still kept the rests it started. ADR 0113 runs a workout session on the watch, which keeps its app running and hearing the phone for the whole workout.

## Decision

- **The watch says it is there.** While its workout session measures the workout, the watch sends the phone a sign (`["here": workoutId]`) every 30 seconds, by message, and only while the phone can be reached: a sign that waited would say nothing of the time it arrives. A command from the watch counts as a sign too.
- **The watch signals every rest of the workout it measures**, started on the phone or on the watch, as ADR 0109 has it, with the notification and the rest-over screen of ADR 0112.
- **The phone keeps its notification as a stand-in.** It schedules the rest's notification as before, whoever started the rest. Its module, which runs even when JavaScript does not, puts the notification off while the watch is heard: on each sign, one due within 75 seconds is moved 75 seconds on, and one due over 75 seconds ago, which the watch signalled, goes. The 75 seconds are over twice the time between signs, so one sign may be lost.
- **The phone takes the alerts back once the watch is not heard for 75 seconds.** Its notification then comes when it is due, or at most 75 seconds after the watch was last heard, if the rest ended in between. While the watch is heard, the phone does not vibrate when the rest ends, and the rest bar says that the watch alerts. The native status tells when the watch was last heard (`heardAt`).
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
