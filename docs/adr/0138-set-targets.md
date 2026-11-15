# 0138. Give each set a target, the user's own or worked out from last time

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

A workout's exercise has one target for all its sets: a rep range, such as 8 to 12, or a time. In a
session each set starts from what was done in the same set last time, and the user decides how much
to add. Many people train with a set plan, such as 80, 85 and 90 kg, and want to be told when to go
up, as progressive overload is what makes training work (#180).

The maintainer approved a mock-up: the target shows faintly in a set's weight and reps boxes, and
ticking a set that was not touched logs the target. This decision covers where the targets come
from and how they are kept. The editor, the session and the watch follow it in pull requests of
their own.

## Decision

- **Targets are per set**, on the workout's exercise. The user's own are kept in
  `workout_exercises.set_targets`, a list of `{weightKg, reps}` or `{weightKg, seconds}`, one per
  set from the first. Fewer than the sets leave the later sets with the last one's. Without them the
  exercise has none of its own.
- **Own targets are checked** by `check_set_targets()`, which `insert_workout_exercises()` runs:
  one to as many as the sets, each a set the exercise can log (`set_suits()`), with values in the
  ranges a logged set has. Others are refused with BB058.
- **Without own targets, each set's is worked out from the same set last time**, the last set when
  last time had fewer, in `set_targets()`:
  - **reps:** the top of the rep range reached, a weight step more for the bottom of the range;
    three times running short of the bottom, a step less for the middle of the range; otherwise the
    same weight for one rep more, up to the top. Done with the body's weight, one rep more.
  - **a time:** the target time reached, 5 seconds more; otherwise the target time.
  - **a distance,** or an exercise never done: none, and the set starts from last time as before.
- **The step is the one the watch's Crown turns by** (`weightStepOf()`): 2 kg for dumbbells, 4 kg
  for kettlebells and 2.5 kg for the rest, in `weight_step()`.
- **`set_targets()` runs as its caller**, so row level security gives it the caller's own workouts
  and logs alone. Last time is found as `last_sets()` finds it: the latest finished log with the
  exercise.
- **A coach's swap drops the own targets** of the exercise it replaces, as they were for another
  exercise. Removals and additions leave the others' as they are.

## Alternatives considered

- **Working targets out in the app.** It would be quicker to build, but the watch and Bite would
  each need a copy of the rule. The rule lives in Postgres, as business logic does here, and the app
  and the watch read its result.
- **Storing worked-out targets after each workout**, in a trigger. They would be read faster, but
  would go stale when a log is edited or deleted, and when the workout's range changes. Working them
  out on read keeps them right, and reads three logs per exercise at most.
- **A target per exercise**, the same for all its sets. It is simpler, but cannot hold a set plan
  such as 80, 85 and 90 kg, which the maintainer asked for.
- **A table of its own for own targets**, a row per set. Every reader and writer of a workout's
  exercises would need to join it, while a list on the exercise moves and is copied with it, as the
  editor and alternatives copy exercises whole.

## Consequences

- A workout saved from an app from before loses its own targets, as such an app does not send them.
  The editor is the only way to make them, and it follows in the next pull request of #180.
- The session shows targets only once it reads `set_targets()`; until then it starts each set from
  last time as before.
- A deload after three short workouts reads three logs; a fourth short one goes down again, as the
  rule looks at the latest three only.
