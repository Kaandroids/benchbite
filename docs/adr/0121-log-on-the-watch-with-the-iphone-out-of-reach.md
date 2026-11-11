# 0121. Log on the watch with the iPhone out of reach

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

The watch sends its commands as a message while the iPhone can be reached, else as a transfer that waits and arrives in order (ADR 0109). But the set it showed was only the one the phone's last state named (ADR 0111, ADR 0117): out of reach no state comes, so after a tick the watch showed the same set again, with Done off while its tick waited, and a pick in the list held Done until the phone took it. Logging stopped after one set, while the approved watch design ("10 · iPhone out of reach") goes on logging and shows "2 sets wait for your iPhone" at the top of the set.

## Decision

- **The watch finds the next set itself while its own changes wait.** With ticks or a pick waiting for the phone, the set it shows is the one the phone finds once it takes them: from the exercise of the latest of them, as a pick opens its exercise and a tick stays on its own until it is done (`markDone`), the first set not done nor ticked on the watch, in it, then in the exercises after it, then before it (`nextSetOf()`). With nothing waiting, it is the phone's, as before; the rest after a tick names the next set the same way, and the list marks the exercise of the set shown. A pick no longer holds Done: the set shown is of the picked exercise, and its tick names it. This amends ADR 0117.
- **Commands stay in order.** A pick and the tick after it must reach the phone in that order, or the tick's time makes the pick look older than the phone's last activity and it is dropped. Transfers arrive in order, but a message can overtake them, so a command goes as a message only while no transfer is still on its way; else as a transfer too.
- **The watch tells whether the iPhone can be reached** from its WatchConnectivity session (`isReachable`, kept as it changes), which is what decides whether a command goes at once.
- **While it cannot, the sets ticked on the watch that wait for the phone are counted** at the top of the set and of the rest, in the app's warning colours, as "2 sets wait for your iPhone", in place of the heart rate; the older "Waiting for your iPhone" line under Done shows only while that one does not. Out of reach with nothing waiting, the heart rate shows, as nothing is lost.
- **Only ticks are counted**, as sets are what the user logs, with one count of the ticks waiting, which the finish's count of the sets saved uses too.

## Alternatives considered

- **A line whenever the iPhone is out of reach:** with nothing waiting it says nothing the user needs, and it would replace the heart rate for a whole workout with the phone in a locker.
- **Counting every command waiting:** "3 changes wait" names nothing the user did.

## Consequences

- Logging goes on with the phone out of reach, and a set ticked then says it has not reached the log yet. The line goes once the phone can be reached again, which may be a moment before it has taken the sets; the line under Done shows while they still wait.
- `isReachable` is false also while the phone is near but its app cannot be woken; the line then shows too, which is still true: the sets wait.
- A set the phone refuses once it takes the waiting ticks, as one the phone changed meanwhile, comes back on the watch with the phone's next state.
