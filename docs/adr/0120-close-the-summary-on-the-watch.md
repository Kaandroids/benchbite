# 0120. Close the summary on the watch

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

ADR 0119 shows a summary on the watch once the phone saves a workout the watch followed, until the next workout runs, without a Done button as the design had none: the watch face was to return with the wrist down. Tried on a device, the summary stays: with no workout the app opens on it again each time, and there is no way to leave it.

## Decision

- **Done at the end of the summary closes it**, a plain pill button below the records, as Keep going on the finish question. The watch then shows "No workout yet".
- **A summary seen also closes when the app goes to the background**, which happens once the watch returns to its face, after the Return to Clock delay with the wrist down; lowering the wrist alone only makes the app inactive. So it is seen once, and the app opens next on what comes next. A summary is seen once it shows with the app active: one that arrives while the app is not, as when the workout is saved on the phone with the wrist down, waits until the app is active again.

## Alternatives considered

- **Only Done:** a summary left open would greet the user at the next workout's start, until it starts.
- **Only the background:** the summary could not be left while looking at it.
- **Closing as the app stops being active:** that also happens for a notification or Control Center, which would close it while it is read.
- **Closing it after a time:** it could close while being read, and a time is arbitrary.

## Consequences

- The summary shows once, and can be left at once.
- A summary closed cannot be seen again on the watch; the phone has the workout's log.
