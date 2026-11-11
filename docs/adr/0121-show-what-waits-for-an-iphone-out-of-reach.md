# 0121. Show what waits for an iPhone out of reach

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

The watch sends its commands as a message while the iPhone can be reached, else as a transfer that waits and arrives in order (ADR 0109), so logging on the watch goes on with the phone out of reach, as at a gym locker. The watch showed nothing of it: a set ticked then looked done, while the phone, and its log, had not taken it yet. The approved watch design ("10 · iPhone out of reach") shows "2 sets wait for your iPhone" at the top of the set.

## Decision

- **The watch tells whether the iPhone can be reached** from its WatchConnectivity session (`isReachable`, kept as it changes), which is what decides whether a command goes at once.
- **While it cannot, the sets ticked on the watch that wait for the phone are counted** at the top of the set and of the rest, in the app's warning colours, as "2 sets wait for your iPhone". The line shows the heart rate otherwise, as before; out of reach with nothing waiting, it shows the heart rate too, as nothing is lost.
- **Only ticks are counted**, as sets are what the user logs; a change of the rest or a pick waits as well, without being named.

## Alternatives considered

- **A line whenever the iPhone is out of reach:** with nothing waiting it says nothing the user needs, and it would replace the heart rate for a whole workout with the phone in a locker.
- **Counting every command waiting:** "3 changes wait" names nothing the user did.

## Consequences

- A set ticked away from the phone says it has not reached the log yet, and the line goes once the phone takes it.
- `isReachable` is false also while the phone is near but its app cannot be woken; the line then shows too, which is still true: the sets wait.
