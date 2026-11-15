# 0137. Join exercises into supersets, done in rounds with one rest

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

People who train often pair exercises into a superset: one set of each, back to back, and a rest
only after the round, such as bench press and rows. It saves time and is common in short workouts.
Benchbite only had "No rest" on an exercise to come close (#140), which still opened the next
exercise only once all sets of the first were done (#141).

A superset touches the workout as saved, the time it is said to take, the session on the phone
and the watch, a finished workout, and Bite's proposals. This decision covers what they all share:
what a superset is and how it is kept. The editor, the session, the watch and Bite follow it in
pull requests of their own, after the mock-up the maintainer approved.

## Decision

- **A superset joins two or more exercises next to each other** in a workout. Its exercises carry
  the same `superset` number, from 1, on `workout_exercises`. An exercise on its own has none.
- **A superset has one rest**, the rest after each round. Its exercises keep `rest_seconds` as
  before, the same for all of them. There is no rest between the exercises of a round.
- **The sets of a superset's exercises may differ.** It has as many rounds as its exercise with the
  most sets, and an exercise out of sets drops out of the later rounds: A with 5 sets, B with 3 and
  C with 2 go ABC, ABC, AB, A, A.
- **A superset that is not one is refused** with BB057: one of a single exercise, of exercises
  apart, with different rests, or with a number that is not a whole number from 1 to 9999.
  `check_supersets()` holds the rule, and `insert_workout_exercises()` runs it, which every way a
  workout's exercises are written goes through: the editor, alternatives, Bite's proposals and the
  onboarding's plan. `save_workout()` runs it first too, as the time reads the supersets.
- **A log checks only the numbers** (`check_superset_numbers()`). It keeps what was done, and an exercise skipped has no sets to
  keep its superset by, so a superset in a log may be left with one exercise or with exercises
  apart.
- **The time counts the superset's rest once per round.** `workout_minutes()` counts a superset's
  exercises without their rest, and its rest once between each two of its rounds.
- **A log keeps each set's superset** on `logged_sets`, sent by `log_workout()` and
  `edit_workout_log()` as the workout's exercises send it. Records and last time's values stay per
  exercise, as a superset does not change what a set was.
- **A coach's edit keeps the supersets.** An exercise swapped in takes the place of the one it
  replaces in its superset, one added joins none, and a superset that a removal leaves with one
  exercise is split up (`edited_workout_exercises()`).
- **The plan from the onboarding never uses supersets.** People build them in their own workouts.

## Alternatives considered

- **A superset as a row of its own**, with its exercises under it. It would hold the rest and an
  order of its own, but every reader of a workout's exercises would need to join it, and moving or
  removing an exercise would change two tables. A number on the exercise keeps the order in one
  place, the exercises' positions.
- **The rest on the superset's last exercise only**, the others' ignored. It would leave rests in
  the data that do nothing, and change when the order inside the superset changes.
- **Equal sets in a superset**, with more sets of one exercise added as the same exercise a second
  time outside it. This would allow pairings that change, such as AB, AB, AB, AC, AC. But a workout
  does not hold the same exercise twice today: the picker, last time's values, which are kept per
  exercise, and Bite's proposals, which name exercises by their id, all count on it. Rounds that
  drop an exercise out of sets cover the common use, and the same exercise twice can come later on
  its own if it is asked for.
- **A short rest between the exercises of a round.** Supersets are done back to back, and a rest
  inside a round can be had by not joining the exercises.

## Consequences

- An app from before sends no superset. An edit of a log that sends none keeps the log's supersets,
  as one that sends no set times keeps the times, so the app sends the key for every exercise,
  null for one on its own. A workout saved from an older app's editor loses its supersets, as the
  database cannot tell that from one whose supersets were split up.
- No superset can be made until the editor learns them: Bite and alternatives only keep the ones a
  workout has. The editor, the session, the watch and Bite follow in the next pull requests of
  #141.
- A workout with a superset is said to take less time than its exercises done one by one.
