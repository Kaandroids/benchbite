# 0125. Turn the weight by the speed of the Crown

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

The Digital Crown turned a set's weight by a fixed step for its equipment (ADR 0111, `weightStepOf()`): 2.5 kg for barbells, machines and the rest, 2 kg for dumbbells, 4 kg for kettlebells, from wherever the weight started. Many machines, cables and small plates move in smaller steps, so a weight such as 11.5 kg could not be reached from 10 on the wrist (#518). A fixed fine step alone would make going from 60 to 100 kg 80 detents. The maintainer chose a step that follows the speed of the turn over a fixed fine step, a coarse and fine mode, or a step learned per exercise.

## Decision

- **The phone sends a fine step with the weight's Crown range** (`fine` on `CrownRange`, 0.5 kg), beside the equipment's step it sent before, so the watch needs no rule of its own.
- **Turned slowly, the Crown moves the weight by the fine step**; turned fast, with detents less than 0.09 s apart, by the equipment's step, onto its grid: 61.5 goes on to 62.5 and then 65. A value is kept to the hundredth and within the range.
- **The reps and a distance keep their single step**, as do the ranges without a fine step: those turn by their step from wherever they start, as before.
- **The hint under the value says both steps**, "Slow 0.5 · fast 2.5 kg", in the watch's languages.

## Alternatives considered

- **Always 0.5 kg:** every weight is reached, but large changes take many detents.
- **A coarse mode and a fine one, switched with a tap:** a tap on the value already moves on to the reps, and a mode on the small screen is one more thing to see.
- **A step learned from the weights logged for the exercise:** clever but unseen, and hard to predict; without a history it falls back to today's step.

## Consequences

- Any weight to half a kilo can be set from the wrist, and large changes stay quick.
- The speed that counts as fast is a guess until it is tried on a watch, and may need tuning.
- Pounds, not supported yet, would need their own fine step.
