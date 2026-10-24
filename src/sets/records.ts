import { useTranslation } from 'react-i18next';

import { useNumberFormat } from '@/i18n/units';
import { minutesAndSeconds } from '@/workouts/format';

import type { SetValues } from './values';

// Kept apart from the queries, so that code without the database, such as a workout in progress,
// can use them.

/** The kinds of record, in the order they are shown (ADR 0024). */
export const RECORD_KINDS = [
  'heaviest',
  'one_rep_max',
  'best_set',
  'most_reps',
  'longest_time',
  'most_time',
  'longest_distance',
  'best_pace',
] as const;

export type RecordKind = (typeof RECORD_KINDS)[number];

/** A record's value, such as "85 kg", "80 kg × 8", "1:15" or "3:40 /km". */
export function useRecordFormat() {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const kilograms = (value: number) => `${format(value, { maximumFractionDigits: 1 })} kg`;
  return ({ kind, value, set }: { kind: RecordKind; value: number; set: SetValues }) => {
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
