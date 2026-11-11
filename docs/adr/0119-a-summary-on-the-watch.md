# 0119. A summary on the watch

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

Once the phone saves a workout the watch followed, the phone shows its finish screen, with the time, the sets, what the watch measured and the new records, while the watch went straight back to "No workout yet". The approved watch design ends with a short summary instead: the workout's name, its time, the sets, the average heart rate and the calories in four tiles, and "2 new records · see your iPhone". The phone keeps the workout and its records (the bests before it, the library that says what each set records); the watch's workout session measures the heart rate and the calories (ADR 0113).

## Decision

- **The watch shows the summary of a workout it followed once the phone says it was saved.** It is built from the last state the phone sent of the workout, and the end the phone sends with how it ended. It shows until the next workout runs, and is kept in memory only: a workout let go of, or one the watch did not follow, shows none.
- **The phone sends how many records the workout set with how it ended.** The save counts them on the workout as it ends, with a running clock's set logged, by `sessionRecords()`, which the finish screen lists them by, so the watch, which has neither the bests nor the library, shows the same number. The last state would miss the set a clock times, which ends only with the save. The sets are those the finish saved (`setsToSave`) of all the workout's sets.
- **The watch reads the average heart rate and the active calories from its own workout builder** as the saved workout ends, the numbers its health store workout gets. Without them, as without health access, the tiles show a dash.
- **The records line shows only with a record**, pointing to the phone, whose finish screen names them.

## Alternatives considered

- **The phone sends the whole summary with how the workout ended:** the time and the sets are in the last state already; only the records change as the workout ends.
- **The phone counts the records in each state:** the last state goes out before a clock's set ends, so its record would be missing.
- **The phone sends the heart rate and calories it reads from the health store:** the watch's own copy reaches the store late (ADR 0099), and the watch measured them itself.
- **A Done button to close the summary:** the design has none; the next workout replaces it, and the watch face returns with the wrist down.

## Consequences

- Finishing on the wrist ends with the workout's numbers there too.
- A set changed on the phone in the moment before it saves may be missing from the summary's count, which shows the last state sent.
- The summary is gone once the watch app is ended, as the phone's ended workouts do not carry it.
