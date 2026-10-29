import { useTranslation } from 'react-i18next';

import { useNumberFormat } from '@/i18n/units';
import { minutesAndSeconds } from '@/lib/time';
import type { SetKind } from '@/sets/fields';

import type { ProgressPoint } from './exercise-history';
import type { Scale } from '@/components/progress-chart';

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

/** How far back the chart goes. */
export const TIME_RANGES = ['1m', '3m', '6m', '1y', 'all'] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

const MONTHS: Record<TimeRange, number | null> = { '1m': 1, '3m': 3, '6m': 6, '1y': 12, all: null };

/** The points from the start of a range up to `today`, or all of them. */
export function pointsIn<T extends { date: Date }>(
  points: readonly T[],
  range: TimeRange,
  today: Date,
): T[] {
  const months = MONTHS[range];
  if (months === null) {
    return [...points];
  }
  // The same day months ago, or the last day of that month when it is shorter (March 31 → Feb 28).
  const lastDay = new Date(today.getFullYear(), today.getMonth() - months + 1, 0).getDate();
  const start = new Date(
    today.getFullYear(),
    today.getMonth() - months,
    Math.min(today.getDate(), lastDay),
  );
  return points.filter((point) => point.date >= start);
}

/** The range the chart starts with: the last three months, or everything when they are empty. */
export function defaultRange(points: readonly { date: Date }[], today: Date): TimeRange {
  return pointsIn(points, '3m', today).length > 0 ? '3m' : 'all';
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
