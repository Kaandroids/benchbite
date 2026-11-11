# 0122. Finish with a long press on the watch

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

ADR 0118 finishes the workout on the watch from the end of the exercise list, a swipe and a scroll away from the set. The approved watch design ("6 · Finish") opens the same question from the list's end or a long press, which ADR 0118 left out.

## Decision

- **A long press on the set or the rest opens the finish question**, the same sheet as the list's end, after 0.6 s and with a click on the wrist, so it is not mistaken for a tap. Done and the values' tiles keep their taps; a press on them does not finish.
- **Nothing on the screen names it**: the list's end stays the way to find it, and the long press is the shortcut once known.

## Alternatives considered

- **A Finish button under Done:** one more control on the set's small screen, next to the one used most, where a tap by mistake would ask to finish.
- **A long press only on the set:** the rest is where a workout often ends, after its last set.

## Consequences

- A workout can be finished from where it is, without going to the list.
- The gesture is hidden, as on watchOS generally; the list's end shows the way.
