import { move } from '@/lib/move';

/**
 * An exercise of a workout as far as supersets go (ADR 0137): the number of the superset it is in,
 * none on its own, and its rest, which in a superset is the rest after each round.
 */
export type SupersetMember = { superset?: number | null; restSeconds: number };

/** Whether the exercise at `index` is in one superset with the one after it. */
export function joinedWithNext(exercises: readonly SupersetMember[], index: number): boolean {
  const superset = exercises[index]?.superset;
  return superset != null && exercises[index + 1]?.superset === superset;
}

/** Where the superset an exercise is in starts and ends, or none for one on its own. */
export type SupersetPlace = { first: boolean; last: boolean } | null;

export function supersetPlace(exercises: readonly SupersetMember[], index: number): SupersetPlace {
  if (exercises[index]?.superset == null) {
    return null;
  }
  return { first: !joinedWithNext(exercises, index - 1), last: !joinedWithNext(exercises, index) };
}

/**
 * The exercises with their supersets as the database takes them: each run of exercises next to
 * each other with one number is a superset, numbered from 1 in order, which shares the rest of its
 * first exercise; a run of one is no superset.
 */
export function tidySupersets<T extends SupersetMember>(exercises: readonly T[]): T[] {
  let number = 0;
  let rest = 0;
  return exercises.map((exercise, index) => {
    const superset = supersetPlace(exercises, index);
    if (!superset || (superset.first && superset.last)) {
      return exercise.superset == null ? exercise : { ...exercise, superset: null };
    }
    if (superset.first) {
      number += 1;
      rest = exercise.restSeconds;
    }
    return exercise.superset === number && exercise.restSeconds === rest
      ? exercise
      : { ...exercise, superset: number, restSeconds: rest };
  });
}

/**
 * Joins the exercise at `index` with the one after it, or parts them. Joined, the one after joins
 * the superset of the one at `index`, with the superset it is in, and takes its rest. Parted, the
 * superset splits in two there, and a part of one exercise is no superset.
 */
export function joinWithNext<T extends SupersetMember>(
  exercises: readonly T[],
  index: number,
  joined: boolean,
): T[] {
  const exercise = exercises[index];
  const next = exercises[index + 1];
  if (!exercise || !next || joinedWithNext(exercises, index) === joined) {
    return [...exercises];
  }
  const fresh = Math.max(0, ...exercises.map((e) => e.superset ?? 0)) + 1;
  if (!joined) {
    const parted = exercise.superset;
    return tidySupersets(
      exercises.map((e, i) => (i > index && e.superset === parted ? { ...e, superset: fresh } : e)),
    );
  }
  const superset = exercise.superset ?? fresh;
  const joining = next.superset;
  return tidySupersets(
    exercises.map((e, i) =>
      i === index ||
      i === index + 1 ||
      e.superset === superset ||
      (joining != null && e.superset === joining)
        ? { ...e, superset, restSeconds: exercise.restSeconds }
        : e,
    ),
  );
}

/**
 * The exercises after the one at `from` was dragged to `to`. Within its superset it changes the
 * superset's order; dragged out of it, it leaves it. Dropped inside another superset it goes past
 * it the way it was moving, below it moving down and above it moving up, as it would split it
 * otherwise; a screen reader's one step up from below a superset thus passes it.
 */
export function moveWithSupersets<T extends SupersetMember>(
  exercises: readonly T[],
  from: number,
  to: number,
): T[] {
  const moved = exercises[from];
  if (!moved) {
    return [...exercises];
  }
  let next = move(exercises, from, to);
  const own = moved.superset;
  const besideOwn =
    own != null && (next[to - 1]?.superset === own || next[to + 1]?.superset === own);
  const landed = besideOwn ? moved : { ...moved, superset: null };
  next[to] = landed;
  const inside = next[to - 1]?.superset;
  if (!besideOwn && inside != null && next[to + 1]?.superset === inside) {
    let edge = to;
    const step = to < from ? -1 : 1;
    while (next[edge + step]?.superset === inside) {
      edge += step;
    }
    next = move(next, to, edge);
  }
  return tidySupersets(next);
}

/** The exercise changed, with its rest given to the whole superset it is in. */
export function changeInSuperset<T extends SupersetMember & { key: string }>(
  exercises: readonly T[],
  changed: T,
): T[] {
  return exercises.map((exercise) =>
    exercise.key === changed.key
      ? changed
      : changed.superset != null && exercise.superset === changed.superset
        ? { ...exercise, restSeconds: changed.restSeconds }
        : exercise,
  );
}
