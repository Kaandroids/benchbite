import type { Json } from '@/lib/database.types';
import type { SetValues } from '@/sets/values';

import type { WorkoutTarget } from './workouts';

/**
 * The user's own target for one set of an exercise in a workout (ADR 0138): a weight and reps, or a
 * time, with a weight where the exercise takes one.
 */
export type SetTarget = { weightKg: number | null; reps: number | null; seconds: number | null };

function numberOrNull(value: Json | undefined): number | null {
  return typeof value === 'number' ? value : null;
}

/** The own targets as the database keeps them (workout_exercises.set_targets); none without. */
export function setTargetsOf(json: Json | null): SetTarget[] | null {
  if (!Array.isArray(json) || json.length === 0) {
    return null;
  }
  return json.map((item) => {
    const target = item !== null && typeof item === 'object' && !Array.isArray(item) ? item : {};
    return {
      weightKg: numberOrNull(target.weightKg),
      reps: numberOrNull(target.reps),
      seconds: numberOrNull(target.seconds),
    };
  });
}

/** The target of the set at `index`: the last one's for a set after the last target. */
export function targetAt(targets: readonly SetTarget[], index: number): SetTarget | undefined {
  return targets[Math.min(index, targets.length - 1)];
}

/**
 * The targets for `sets` sets: a set added takes the last one's target, and a set removed takes
 * its target with it, as the database keeps at most one per set.
 */
export function resizeTargets(targets: SetTarget[] | null, sets: number): SetTarget[] | null {
  if (!targets || targets.length === 0) {
    return null;
  }
  return Array.from({ length: sets }, (_, index) => targetAt(targets, index) as SetTarget);
}

/** The targets for `sets` sets with the one at `index` changed to `target`. */
export function withTarget(
  targets: SetTarget[] | null,
  sets: number,
  index: number,
  target: SetTarget,
): SetTarget[] {
  const all = resizeTargets(targets, sets) ?? Array.from({ length: sets }, () => target);
  return all.map((current, place) => (place === index ? target : current));
}

/**
 * The targets an exercise starts with when the user adds them: each set last time's weight, from
 * the same set or the last one, with the bottom of the rep range or the target time.
 */
export function firstTargets(
  sets: number,
  target: WorkoutTarget,
  last: readonly SetValues[] | undefined,
  weighted: boolean,
): SetTarget[] {
  return Array.from({ length: sets }, (_, index) => {
    const before = last && last.length > 0 ? last[Math.min(index, last.length - 1)] : undefined;
    return {
      weightKg: weighted ? (before?.weightKg ?? null) : null,
      reps: 'reps' in target ? target.reps.min : null,
      seconds: 'reps' in target ? null : (target.seconds ?? before?.seconds ?? 30),
    };
  });
}
