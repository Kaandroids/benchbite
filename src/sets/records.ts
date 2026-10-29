import { useTranslation } from 'react-i18next';

import { useNumberFormat } from '@/i18n/units';
import { minutesAndSeconds } from '@/lib/time';

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

/**
 * How much a record beat the best before it, in the record's unit: "+2.5 kg", "+2", "+0:25", or
 * "−0:20 /km" for a faster pace.
 */
export function useRecordGainFormat() {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  return ({ kind, value, previous }: { kind: RecordKind; value: number; previous: number }) => {
    switch (kind) {
      case 'heaviest':
      case 'best_set':
        return `+${format(value - previous, { maximumFractionDigits: 1 })} kg`;
      case 'one_rep_max':
        // As the record shows it, in whole kilograms.
        return `+${format(Math.round(value) - Math.round(previous))} kg`;
      case 'most_reps':
        return `+${format(value - previous)}`;
      case 'longest_time':
      case 'most_time':
        return `+${minutesAndSeconds(value - previous)}`;
      case 'longest_distance':
        return `+${format(value - previous)} m`;
      case 'best_pace':
        return `−${t('exerciseHistory.pace', { time: minutesAndSeconds(Math.round(previous - value)) })}`;
    }
  };
}
