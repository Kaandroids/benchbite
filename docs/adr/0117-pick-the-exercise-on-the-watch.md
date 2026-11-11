# 0117. Pick the exercise on the watch

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

The watch shows the set the phone says comes next: the open exercise's first set not done, then those of the exercises after it (`nextSetOf`). To do the exercises in another order, as when a machine is taken, the user had to pick the exercise on the phone. The approved watch design has a list of the workout's exercises beside the set, from which one is picked.

## Decision

- **The list sits beside the set, a swipe away.** It shows the workout's name with its sets done, and each exercise with its sets done, marking the one whose set comes next ("NOW") and those whose sets are all done. An exercise whose sets are all done cannot be picked, as it has no set to come next.
- **Picking an exercise opens it on the phone.** The watch sends a new command, `open`, with the exercise's index, and goes back to the set. The phone makes it the open exercise, as a tap on it there does, so that its first set not done comes next, on both devices. One the workout no longer has changes nothing.
- **The watch waits for the phone, as it does for a tick.** It shows the set the phone's next state names, not one it reckons itself. Until the phone has applied a pick, the set says which exercise is opening in place of Done, as a tick then would be of the set before the pick, and the list marks the picked exercise. A pick that differs from the one the list marks is sent, so that picking the phone's exercise again undoes a pick that waits; the phone applies them in order, and the last one counts.
- **A pick that waited does not undo a set ticked since.** As `markDone` keeps the open exercise for a tick older than the workout's last one, the phone leaves the open exercise as it is for a pick made before the last set ticked.
- **The protocol's version stays 1.** The command is new, and a phone from before it drops it as one it does not know, which changes nothing.

## Alternatives considered

- **The watch shows the picked exercise at once, before the phone answers:** the set to come next would then be reckoned on both devices, which could disagree, as when the phone opened another exercise meanwhile; the phone answers within a moment while it can be reached.
- **A list only on the watch, which picks among its own sets:** the phone would go on showing another exercise as open, and a tick from the watch would move it on from there.

## Consequences

- The exercises can be done in any order from the wrist.
- With the phone out of reach, a pick waits with the other commands, and the set shown changes once the phone has it.
