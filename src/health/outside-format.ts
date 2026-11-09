// How a workout from another app is put into words (#468, ADR 0106): its length, its line of
// figures and where it came from, wherever it shows.
import { useTranslation } from 'react-i18next';

import { useDurationFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';

import type { ListedOutsideWorkout } from './outside-workouts';
import { useStoreName } from './use-store-name';

/** How long a workout from another app took, in whole minutes. */
export const outsideMinutes = (workout: ListedOutsideWorkout) =>
  Math.max(1, Math.round((workout.endedAt.getTime() - workout.startedAt.getTime()) / 60_000));

/** A workout's length, calories and source, as one line. */
export function useOutsideSummary() {
  const { t } = useTranslation();
  const duration = useDurationFormat();
  const { format } = useNumberFormat();
  return (workout: ListedOutsideWorkout, withSource = true) =>
    [
      duration(outsideMinutes(workout)),
      workout.activeKcal !== null
        ? t('history.kcalMeasured', { kcal: format(Math.round(workout.activeKcal)) })
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
  return (workout: ListedOutsideWorkout, form: 'from' | 'through'): string | null => {
    if (workout.source) {
      if (form === 'from') return t('health.outside.from', { source: workout.source });
      return store ? t('health.watch.through', { source: workout.source, store }) : workout.source;
    }
    if (!store) return null;
    return form === 'from'
      ? t('health.outside.fromStore', { store })
      : t('health.watch.throughStore', { store });
  };
}
