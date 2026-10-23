import type { LibraryExercise } from '@/exercises/library';
import { minutesAndSeconds } from '@/workouts/format';
import type { WorkoutTarget } from '@/workouts/workouts';

import type { SetValues } from './session';

export type SetField = keyof SetValues;

/** How the sets of an exercise are logged, from what it records (ADR 0008). */
export type SetKind = {
  fields: SetField[];
  /** Logged with a clock instead of a tick. */
  timed: boolean;
  /** The weight is added to the body, and optional. */
  addedWeight: boolean;
};

export function setKindOf(
  metrics: LibraryExercise['metrics'] | undefined,
  target: WorkoutTarget,
): SetKind {
  const reps = metrics ? metrics.includes('reps') : 'reps' in target;
  if (reps) {
    return {
      fields: ['weightKg', 'reps'],
      timed: false,
      addedWeight: !(metrics ?? []).includes('weight'),
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

/** Reads a time typed as "1:30" or "90"; null when it is not one. */
export function parseTime(text: string): number | null {
  const match = /^(?:(\d+):)?(\d+)$/.exec(text.trim());
  if (!match) {
    return null;
  }
  const seconds = Number(match[1] ?? 0) * 60 + Number(match[2]);
  return seconds > 0 ? seconds : null;
}
