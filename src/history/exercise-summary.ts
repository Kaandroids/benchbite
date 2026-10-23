import type { SetKind } from '@/sessions/fields';
import type { SetValues } from '@/sessions/session';

/** What an exercise's sets add up to, depending on what it records. */
export type ExerciseTotal =
  | { kind: 'volume'; kilograms: number }
  | { kind: 'reps'; reps: number }
  | { kind: 'time'; seconds: number }
  | { kind: 'distance'; meters: number };

/**
 * An exercise's best set and its total. The best set is the heaviest, then the one with the most
 * reps; for timed exercises the longest, or the farthest for a distance. The total is the weight
 * lifted, or the reps of a bodyweight exercise without added weight, the time held or the
 * distance covered.
 */
export function summarizeSets(
  sets: SetValues[],
  kind: SetKind,
): { best: SetValues | null; total: ExerciseTotal } {
  const sum = (pick: (set: SetValues) => number) => sets.reduce((total, s) => total + pick(s), 0);
  const bestBy = (...keys: ((set: SetValues) => number)[]) =>
    sets.reduce<SetValues | null>((best, set) => {
      if (!best) {
        return set;
      }
      for (const key of keys) {
        if (key(set) !== key(best)) {
          return key(set) > key(best) ? set : best;
        }
      }
      return best;
    }, null);

  if (kind.fields.includes('reps')) {
    const kilograms = sum((s) => (s.weightKg ?? 0) * (s.reps ?? 0));
    return {
      best: bestBy(
        (s) => s.weightKg ?? 0,
        (s) => s.reps ?? 0,
      ),
      total:
        kilograms > 0
          ? { kind: 'volume', kilograms }
          : { kind: 'reps', reps: sum((s) => s.reps ?? 0) },
    };
  }
  if (kind.fields.includes('meters')) {
    return {
      best: bestBy(
        (s) => s.meters ?? 0,
        (s) => s.seconds ?? 0,
      ),
      total: { kind: 'distance', meters: sum((s) => s.meters ?? 0) },
    };
  }
  return {
    best: bestBy((s) => s.seconds ?? 0),
    total: { kind: 'time', seconds: sum((s) => s.seconds ?? 0) },
  };
}

/** A set in few characters for a list of sets, such as "80 × 8", "14", "0:50". */
export function shortSet(set: SetValues, kind: SetKind, describe: (set: SetValues) => string) {
  if (kind.fields.includes('reps')) {
    return set.weightKg === null ? String(set.reps ?? '—') : `${set.weightKg} × ${set.reps ?? '—'}`;
  }
  return describe(set);
}
