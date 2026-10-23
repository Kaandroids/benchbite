import { useTranslation } from 'react-i18next';

import { useNumberFormat } from '@/i18n/units';
import type { SetKind } from '@/sessions/fields';
import { minutesAndSeconds } from '@/workouts/format';

import type { ExerciseRecord, ProgressPoint } from './exercise-history';
import type { Scale } from './progress-chart';

/** What the progress chart can show, depending on what the exercise records. */
export type ProgressMetric =
  | 'heaviest'
  | 'oneRepMax'
  | 'volume'
  | 'mostReps'
  | 'totalReps'
  | 'longest'
  | 'totalTime'
  | 'distance'
  | 'pace';

/** The chart's choices for an exercise, the first one shown first. */
export function metricsOf(kind: SetKind): [ProgressMetric, ...ProgressMetric[]] {
  if (kind.fields.includes('reps')) {
    return kind.addedWeight ? ['mostReps', 'totalReps'] : ['heaviest', 'oneRepMax', 'volume'];
  }
  return kind.fields.includes('meters') ? ['distance', 'pace'] : ['longest', 'totalTime'];
}

const VALUE_OF: Record<ProgressMetric, (point: ProgressPoint) => number | null> = {
  heaviest: (point) => point.heaviestKg,
  oneRepMax: (point) => point.oneRepMaxKg,
  volume: (point) => point.volumeKg,
  mostReps: (point) => point.mostReps,
  totalReps: (point) => point.totalReps,
  longest: (point) => point.longestSeconds,
  totalTime: (point) => point.totalSeconds,
  distance: (point) => point.longestMeters,
  pace: (point) => point.bestPace,
};

/** The workouts that have a value for the metric, oldest first. */
export function pointsOf(progress: readonly ProgressPoint[], metric: ProgressMetric) {
  return progress.flatMap((point) => {
    const value = VALUE_OF[metric](point);
    return value === null ? [] : [{ date: point.startedAt, value }];
  });
}

/** Whether a lower value is the better one, as for a pace. */
export const lowerIsBetter = (metric: ProgressMetric) => metric === 'pace';

/** How a metric's values step on the chart's axis. */
export function scaleOf(metric: ProgressMetric): Scale {
  switch (metric) {
    case 'heaviest':
    case 'oneRepMax':
    case 'volume':
      return 'decimal';
    case 'mostReps':
    case 'totalReps':
    case 'distance':
      return 'whole';
    case 'longest':
    case 'totalTime':
    case 'pace':
      return 'time';
  }
}

/**
 * Formats a metric's values: with their unit, such as "85 kg", "1:15" or "3:40 /km", and as the
 * short number on the chart's axis.
 */
export function useMetricFormat() {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const kilograms = (value: number) => format(value, { maximumFractionDigits: 1 });
  const time = (value: number) => minutesAndSeconds(Math.round(value));
  return {
    value: (metric: ProgressMetric, value: number) => {
      switch (metric) {
        case 'heaviest':
        case 'volume':
          return `${kilograms(value)} kg`;
        // An estimate, in whole kilograms as on the records.
        case 'oneRepMax':
          return `${kilograms(Math.round(value))} kg`;
        case 'mostReps':
        case 'totalReps':
          return t('history.exercise.reps', { count: value });
        case 'longest':
        case 'totalTime':
          return time(value);
        case 'distance':
          return `${format(value)} m`;
        case 'pace':
          return t('exerciseHistory.pace', { time: time(value) });
      }
    },
    tick: (metric: ProgressMetric, value: number) =>
      scaleOf(metric) === 'time' ? time(value) : kilograms(value),
  };
}

/** A record's value, such as "85 kg", "80 kg × 8", "1:15" or "3:40 /km". */
export function useRecordFormat() {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const kilograms = (value: number) => `${format(value, { maximumFractionDigits: 1 })} kg`;
  return ({ kind, value, set }: Pick<ExerciseRecord, 'kind' | 'value' | 'set'>) => {
    switch (kind) {
      case 'heaviest':
        return kilograms(value);
      case 'one_rep_max':
        return kilograms(Math.round(value));
      case 'best_set':
        return `${kilograms(set.weightKg ?? 0)} × ${set.reps ?? 0}`;
      case 'most_reps':
        return format(value);
      case 'longest_time':
      case 'most_time':
        return minutesAndSeconds(value);
      case 'longest_distance':
        return `${format(value)} m`;
      case 'best_pace':
        return t('exerciseHistory.pace', { time: minutesAndSeconds(Math.round(value)) });
    }
  };
}
