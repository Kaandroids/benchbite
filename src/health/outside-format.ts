// How a workout from another app is put into words (#468, ADR 0106): its length, its line of
// figures and where it came from, wherever it shows.
import { useTranslation } from 'react-i18next';

import { useDurationFormat } from '@/i18n/dates';
import { minutesBetween } from '@/lib/time';

import { useFigureFormat } from './figure-row';
import type { ListedOutsideWorkout } from './outside-workouts';
import { useSourceThrough, useStoreName } from './use-store-name';

/** How long a workout from another app took, in whole minutes, one at least. */
export const outsideMinutes = (workout: ListedOutsideWorkout) =>
  Math.max(1, minutesBetween(workout.startedAt, workout.endedAt));

/** A workout's length, calories and source, as one line. */
export function useOutsideSummary() {
  const { t } = useTranslation();
  const duration = useDurationFormat();
  const figure = useFigureFormat();
  return (workout: ListedOutsideWorkout, withSource = true) =>
    [
      duration(outsideMinutes(workout)),
      workout.activeKcal !== null
        ? t('health.outside.kcal', { kcal: figure.kcal(workout.activeKcal) })
        : null,
      withSource ? workout.source : null,
    ]
      .filter(Boolean)
      .join(' · ');
}

/**
 * Where a workout came from, in words: "From Apple Watch" under it, or "Apple Watch, through Apple
 * Health" in its details; the store alone when no app is named. Null without either.
 */
export function useOutsideSource() {
  const { t } = useTranslation();
  const store = useStoreName();
  const through = useSourceThrough();
  return (workout: ListedOutsideWorkout, form: 'from' | 'through'): string | null => {
    if (form === 'through') return through(workout.source);
    if (workout.source) return t('health.outside.from', { source: workout.source });
    return store ? t('health.outside.fromStore', { store }) : null;
  };
}
