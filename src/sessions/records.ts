import type { SetKind } from '@/sets/fields';
import { RECORD_KINDS, type RecordKind } from '@/sets/records';
import type { SetValues } from '@/sets/values';

/** An exercise's best value of each kind of record before the workout (exercise_bests()). */
export type Bests = Partial<Record<RecordKind, number>>;

/** A record set in the workout: its kind and value, and the set that set it. */
export type NewRecord = { kind: RecordKind; value: number; set: SetValues };

/** The kinds a lower value is better for. */
const LOWER_IS_BETTER: readonly RecordKind[] = ['best_pace'];

/** The weight that could be lifted once, as the database estimates it (one_rep_max()). */
export function oneRepMax(weightKg: number, reps: number): number {
  return reps === 1 ? weightKg : Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

/** What a set comes to for each kind of record the exercise has, as exercise_records() counts it. */
export function recordValues({ weightKg, reps, seconds, meters }: SetValues, kind: SetKind) {
  const values: Partial<Record<Exclude<RecordKind, 'most_time'>, number>> = {};
  if (kind.fields.includes('reps')) {
    if (weightKg !== null && weightKg > 0) {
      values.heaviest = weightKg;
      if (reps !== null && !kind.addedWeight) {
        values.one_rep_max = oneRepMax(weightKg, reps);
        values.best_set = weightKg * reps;
      }
    }
    if (reps !== null) {
      values.most_reps = reps;
    }
  } else if (kind.fields.includes('meters')) {
    if (meters !== null) {
      values.longest_distance = meters;
      if (seconds !== null) {
        values.best_pace = Math.round(((seconds * 1000) / meters) * 10) / 10;
      }
    }
  } else if (seconds !== null) {
    values.longest_time = seconds;
  }
  return values;
}

const beats = (kind: RecordKind, value: number, best: number) =>
  LOWER_IS_BETTER.includes(kind) ? value < best : value > best;

/**
 * The records an exercise's done sets set, against its bests before the workout: for each set, the
 * kinds it beat everything before it in, and for the workout, the best of each kind that beat the
 * old one. Without a best of a kind, as for an exercise never logged before, nothing is a record of
 * it.
 */
export function newRecords(
  sets: readonly (SetValues & { done: boolean })[],
  kind: SetKind,
  bests: Bests | undefined,
): { bySet: Map<number, RecordKind[]>; records: NewRecord[] } {
  const bySet = new Map<number, RecordKind[]>();
  const best: Bests = { ...bests };
  const records = new Map<RecordKind, NewRecord>();
  let seconds = 0;
  sets.forEach((set, index) => {
    if (!set.done) {
      return;
    }
    seconds += set.seconds ?? 0;
    for (const [key, value] of Object.entries(recordValues(set, kind))) {
      const recordKind = key as RecordKind;
      const previous = best[recordKind];
      if (previous !== undefined && beats(recordKind, value, previous)) {
        best[recordKind] = value;
        records.set(recordKind, { kind: recordKind, value, set });
        bySet.set(index, [...(bySet.get(index) ?? []), recordKind]);
      }
    }
  });
  // The most time in one workout is the workout's total, so it is no single set's.
  if (bests?.most_time !== undefined && seconds > bests.most_time) {
    records.set('most_time', {
      kind: 'most_time',
      value: seconds,
      set: { weightKg: null, reps: null, seconds, meters: null },
    });
  }
  return {
    bySet,
    records: RECORD_KINDS.flatMap((recordKind) => {
      const record = records.get(recordKind);
      return record ? [record] : [];
    }),
  };
}
