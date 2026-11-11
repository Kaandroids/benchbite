# 0120. Close the summary on the watch

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

ADR 0119 shows a summary on the watch once the phone saves a workout the watch followed, until the next workout runs, without a Done button as the design had none: the watch face was to return with the wrist down. Tried on a device, the summary stays: with no workout the app opens on it again each time, and there is no way to leave it.

## Decision

- **Done at the end of the summary closes it**, a plain pill button below the records, as Keep going on the finish question. The watch then shows "No workout yet".
- **The summary also closes when the app goes to the background**, as with the wrist down, so that it is seen once: the app opens next on what comes next. A summary that arrives while the app is in the background, as when the workout is saved on the phone, still shows when the app opens.

## Alternatives considered

- **Only Done:** a summary left open would greet the user at the next workout's start, until it starts.
- **Only the wrist down:** the summary could not be left while looking at it.
- **Closing it after a time:** it could close while being read, and a time is arbitrary.

## Consequences

- The summary shows once, and can be left at once.
- A summary closed cannot be seen again on the watch; the phone has the workout's log.
