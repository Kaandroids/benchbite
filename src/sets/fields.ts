import type { LibraryExercise } from '@/exercises/library';
import { minutesAndSeconds } from '@/lib/time';
import type { WorkoutTarget } from '@/workouts/workouts';

import type { SetValues } from './values';

export type SetField = keyof SetValues;

/** How the sets of an exercise are logged, from what it records (ADR 0008). */
export type SetKind = {
  fields: SetField[];
  /** Logged with a clock instead of a tick. */
  timed: boolean;
  /** The weight is added to the body, and optional. */
  addedWeight: boolean;
};

/** Whether an exercise of reps takes weight added to the body rather than lifted, as a pull-up. */
export function addsWeight(metrics: LibraryExercise['metrics']): boolean {
  return metrics.includes('reps') && !metrics.includes('weight');
}

export function setKindOf(
  metrics: LibraryExercise['metrics'] | undefined,
  target: WorkoutTarget,
): SetKind {
  const reps = metrics ? metrics.includes('reps') : 'reps' in target;
  if (reps) {
    return {
      fields: ['weightKg', 'reps'],
      timed: false,
      addedWeight: metrics ? addsWeight(metrics) : true,
    };
  }
  const distance = metrics ? metrics.includes('distance') : 'meters' in target && !!target.meters;
  // A distance has a time only where the exercise records one, as a carry does not: the database
  // takes no time for it (set_suits(), #625). Its distance is then logged with a tick.
  const timed = !distance || (metrics ? metrics.includes('duration') : true);
  return {
    fields: distance ? (timed ? ['meters', 'seconds'] : ['meters']) : ['seconds'],
    timed,
    addedWeight: false,
  };
}

/**
 * What a weight usually goes up by with the equipment: dumbbells in pairs of a kilogram each,
 * kettlebells by 4 kg, and plates by 1.25 kg a side. The database's weight_step() works set targets
 * out by the same steps (20261116100000_set_targets.sql): change them together.
 */
export function weightStepOf(equipment: LibraryExercise['equipment'] | undefined): number {
  switch (equipment) {
    case 'dumbbell':
      return 2;
    case 'kettlebells':
      return 4;
    default:
      return 2.5;
  }
}

/** How a set's numbers, and a number of reps on their own, read in the app's language. */
export type SetWords = {
  number: (value: number) => string;
  reps: (count: number) => string;
};

/**
 * A set in a few characters, such as "80 kg × 8", "8 reps", "0:50" or "2000 m · 8:12" (#615). A
 * value it does not have is left out, and a set without any is empty.
 */
export function describeSet(values: SetValues, kind: SetKind, words: SetWords): string {
  if (kind.fields.includes('reps')) {
    const weight = values.weightKg === null ? null : `${words.number(values.weightKg)} kg`;
    if (values.reps === null) {
      return weight ?? '';
    }
    return weight === null ? words.reps(values.reps) : `${weight} × ${words.number(values.reps)}`;
  }
  const time = values.seconds === null ? null : minutesAndSeconds(values.seconds);
  const meters = values.meters === null ? null : `${words.number(values.meters)} m`;
  return [kind.fields.includes('meters') ? meters : null, time].filter(Boolean).join(' · ');
}

/**
 * The most a set can hold of each value, as the database allows it (logged_sets). The weight is
 * the largest quarter kilogram below its limit of 999.99.
 */
export const SET_LIMITS: Record<SetField, number> = {
  weightKg: 999.75,
  reps: 999,
  seconds: 86_400,
  meters: 1_000_000,
};

/**
 * A value as a set keeps it, from what was typed or sent by the watch: the weight to a quarter
 * kilogram and the rest whole, at most what a set can hold; none when it rounds to nothing.
 */
export function setValueOf(field: SetField, value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  const rounded = field === 'weightKg' ? Math.round(value * 4) / 4 : Math.round(value);
  return rounded > 0 ? Math.min(rounded, SET_LIMITS[field]) : null;
}

/**
 * Reads a time typed as "1:30" or as digits; null when it is not one. One or two digits are
 * seconds, and more are read as on a clock, the last two being the seconds: "130" is 1:30 and
 * "1111" is 11:11. A time is at most a day.
 */
export function parseTime(text: string): number | null {
  const match = /^(?:(\d+):)?(\d+)$/.exec(text.trim());
  if (!match) {
    return null;
  }
  const [, minutes, rest = ''] = match;
  const seconds =
    minutes === undefined && rest.length > 2
      ? Number(rest.slice(0, -2)) * 60 + Number(rest.slice(-2))
      : Number(minutes ?? 0) * 60 + Number(rest);
  return seconds > 0 ? Math.min(seconds, SET_LIMITS.seconds) : null;
}
