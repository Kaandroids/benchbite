# 0116. Show the watch and its heart rate on the phone

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

Since ADR 0113 the watch measures the heart rate of the workout it follows and shows it on its own screens. The phone does not show that the workout runs on the watch too, nor the heart rate, so a user who looks at the phone during the workout cannot tell whether the watch is measuring. ADR 0114 has the watch send the phone a sign every 30 seconds while it measures, which tells the phone that it is there.

## Decision

- **The watch's sign carries its heart rate.** It becomes `["here": workoutId, "rest": endsAt, "bpm": heartRate]`, with the latest heart rate the workout session measured, if any. The watch sends it, as before, every 30 seconds and when the rest it signals changes, and now also when the heart rate changes, at most every 5 seconds.
- **The phone keeps the heart rate only in memory.** The watch link's module keeps the last one heard for the workout the phone runs, forgets it with that workout, and tells it with the watch's status (`heartRate`). It is not stored on the device, sent to Supabase or kept with the workout: the watch saves the heart rate to the health store with its workout (ADR 0113).
- **The session screen shows a chip while the watch is heard.** Under the header it says "On your Apple Watch", with the heart rate once there is one. The chip shows only while the watch follows the workout and was heard from in the last 75 seconds, the same check that leaves the rest to the watch (ADR 0114), so it goes once the watch stops talking.

## Alternatives considered

- **A message of its own for the heart rate:** the sign already goes to the phone while the watch measures, is about the same workout, and is dropped when the phone is out of reach; a second message would repeat all of that.
- **Sending each heart rate reading:** the workout session reads one every few seconds; at most one every 5 seconds is as fresh to look at and keeps the messages few.
- **Reading the heart rate on the phone from the health store:** samples reach the phone's store late and in batches, so the phone would show an old value.

## Consequences

- The phone shows that the workout runs on the watch, and a heart rate at most a few seconds old while the phone can reach the watch.
- Each sign also refreshes the time the watch is heard, so the phone takes the rest's alerts back no later than before.
- Out of reach, the phone keeps showing the last heart rate it heard until the watch is no longer taken to be there.
- Using the heart rate for suggestions, as in #513, needs it kept per set and rest: that is a decision of its own.
