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
- **`save_workout()` refuses a superset that is not one** with BB057: one of a single exercise, of
  exercises apart, with different rests, or with a number that is not a whole number from 1. Every
  way a workout's exercises change goes through it: the editor, alternatives and Bite's proposals.
  `check_supersets()` holds the rule, for a log without the rest.
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

- An app from before sends no superset, and its workouts and logs stay as they are.
- No superset can be made until the editor learns them: Bite and alternatives only keep the ones a
  workout has. The editor, the session, the watch and Bite follow in the next pull requests of
  #141.
- A workout with a superset is said to take less time than its exercises done one by one.
