import { useQuery } from '@tanstack/react-query';

import { toIsoDate } from '@/i18n/dates';
import { fetchAllPages } from '@/lib/paging';
import { supabase } from '@/lib/supabase';
import type { RecordKind } from '@/sets/records';
import type { SetValues } from '@/sets/values';

import { isRecordKind, setValuesOf } from './exercise-history';
import { RECORDS_KEY } from './history';

/** A workout that beat the best of a kind of record of an exercise (record_history()). */
export type BeatenRecord = {
  exerciseId: string;
  kind: RecordKind;
  value: number;
  /** The best it beat. */
  previous: number;
  /** The set that beat it; for most_time, the workout's total time. */
  set: SetValues;
  logId: number;
  /** YYYY-MM-DD, the device's day the workout started on. */
  day: string;
};

/**
 * The records the signed-in user beat across every exercise, the latest first, one for each
 * exercise of a workout (ADR 0047). Read page by page, as a long history passes the rows a
 * request returns.
 */
export function useRecordHistory() {
  return useQuery({
    queryKey: RECORDS_KEY,
    queryFn: async (): Promise<BeatenRecord[]> => {
      const rows = await fetchAllPages((from, to) =>
        supabase
          .rpc('record_history')
          .order('achieved_on', { ascending: false })
          .order('log_id', { ascending: false })
          .order('exercise_id')
          .range(from, to),
      );
      return rows.filter(isRecordKind).map((row) => ({
        exerciseId: row.exercise_id,
        kind: row.kind,
        value: Number(row.value),
        previous: Number(row.previous),
        set: setValuesOf(row),
        logId: row.log_id,
        day: row.achieved_on,
      }));
    },
  });
}

/** YYYY-MM, the month of a day or a date. */
export function monthOf(day: string | Date): string {
  return (typeof day === 'string' ? day : toIsoDate(day)).slice(0, 7);
}

/** The records beaten in the month of `today`. */
export function recordsThisMonth(records: readonly BeatenRecord[], today: Date): BeatenRecord[] {
  return records.filter((record) => monthOf(record.day) === monthOf(today));
}

/** The records by the month they were beaten in, YYYY-MM, in the order they come. */
export function byMonth(records: readonly BeatenRecord[]): [string, BeatenRecord[]][] {
  const months = new Map<string, BeatenRecord[]>();
  for (const record of records) {
    const month = monthOf(record.day);
    const inMonth = months.get(month);
    if (inMonth) {
      inMonth.push(record);
    } else {
      months.set(month, [record]);
    }
  }
  return [...months];
}

/** Each exercise's latest record beaten, by the exercise, in the order of the latest first. */
export function latestByExercise(records: readonly BeatenRecord[]): BeatenRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => !seen.has(record.exerciseId) && seen.add(record.exerciseId));
}
