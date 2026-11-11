# 0124. Time a set on the watch

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

ADR 0111 left sets measured by time to the phone: "A set measured by time is still finished on the phone, whose clock measures it, until the watch runs its own." A workout with a plank or a row needed the phone for those sets. On the phone, Start runs the set's clock from 0:00 and Stop ticks the set with the time it ran (`startClock`, `stopClock`); the plan's target time is shown in the exercise's heading only, and nothing happens when the clock reaches it. The maintainer approved a design that does the same on the watch.

## Decision

- **The watch starts and stops the phone's clock.** The phone keeps one clock (`Session.clock`), and the state now carries it (`clock`: the set and its start), so both show the same second and a clock started on one can be stopped on the other.
- **Start is a new command, `startClock`,** with the set and the time it was pressed. The phone starts the clock then, unless the set is done or was ticked since, or a clock already runs: of the same set, as when it was started on both, or of another, which the watch did not show.
- **Stop is the set's tick.** A tick of the set whose clock runs already stops it with the time it ran (`markDone`), so Stop sends the same `setDone` as Done, with the values edited on the watch, and starts the set's rest the same way; waiting out of reach, it counts and moves on as a tick does (ADR 0121). While the set's start waits for the phone, the tick goes as a transfer behind it, so that it cannot arrive first.
- **The set shows its clock in place of the weight and the reps while it runs or the set has no time yet**, as the phone does; a timed set with a time, typed on the phone or ticked before, is ticked as it is, with Done. The clock shows 0:00 until it starts, then counting up in the accent colour, with the plan's target beside it ("TIME · TARGET 0:40") when there is one; nothing happens at the target, as on the phone.
- **A set with a distance** turns its distance with the Crown, by 50 m, as a weight is turned; the time is never turned, as the clock measures it.

## Alternatives considered

- **A Stop command of its own:** the phone's tick already stops the clock with the time it ran; a second way would need the same rules twice.
- **A ring that fills to the target and a tap on the wrist there:** the phone does neither; left for both together, if wanted.
- **The watch measuring the time itself and sending it with the tick:** two clocks could differ; the phone's stays the one.

## Consequences

- A workout with timed sets can be logged from the wrist.
- A clock started on the watch counts from the watch's own time; a watch whose clock runs off logs the set a little longer or shorter.
- The next set's label after a timed set still reads "—" for its time, as the phone describes a set whose clock has not run.
