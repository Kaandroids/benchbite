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
  return {
    fields: distance ? ['meters', 'seconds'] : ['seconds'],
    timed: true,
    addedWeight: false,
  };
}

/** A set in a few characters, such as "80 kg × 8", "0:50" or "2000 m · 8:12". */
export function describeSet(values: SetValues, kind: SetKind): string {
  if (kind.fields.includes('reps')) {
    const weight = values.weightKg === null ? '—' : `${values.weightKg} kg`;
    return `${weight} × ${values.reps ?? '—'}`;
  }
  const time = values.seconds === null ? null : minutesAndSeconds(values.seconds);
  if (kind.fields.includes('meters')) {
    return [values.meters === null ? null : `${values.meters} m`, time].filter(Boolean).join(' · ');
  }
  return time ?? '—';
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
