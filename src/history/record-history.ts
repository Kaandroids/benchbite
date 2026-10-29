import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { RECORD_KINDS, type RecordKind } from '@/sets/records';
import type { SetValues } from '@/sets/values';

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

// Postgres numerics arrive as numbers, and the generated types do not say they can be null.
const numberOrNull = (value: number | null | undefined) =>
  value === null || value === undefined ? null : Number(value);

/**
 * The records the signed-in user beat across every exercise, the latest first, one for each
 * exercise of a workout (ADR 0047).
 */
export function useRecordHistory() {
  return useQuery({
    queryKey: RECORDS_KEY,
    queryFn: async (): Promise<BeatenRecord[]> => {
      const { data, error } = await supabase.rpc('record_history');
      if (error) {
        throw error;
      }
      return data
        .filter((row): row is typeof row & { kind: RecordKind } =>
          (RECORD_KINDS as readonly string[]).includes(row.kind),
        )
        .map((row) => ({
          exerciseId: row.exercise_id,
          kind: row.kind,
          value: Number(row.value),
          previous: Number(row.previous),
          set: {
            weightKg: numberOrNull(row.weight_kg),
            reps: numberOrNull(row.reps),
            seconds: numberOrNull(row.seconds),
            meters: numberOrNull(row.meters),
          },
          logId: row.log_id,
          day: row.achieved_on,
        }));
    },
  });
}

/** The records beaten in the month of `today`. */
export function recordsThisMonth(records: readonly BeatenRecord[], today: Date): BeatenRecord[] {
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  return records.filter((record) => record.day.startsWith(month));
}

/** Each exercise's latest record beaten, by the exercise, in the order of the latest first. */
export function latestByExercise(records: readonly BeatenRecord[]): BeatenRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => !seen.has(record.exerciseId) && seen.add(record.exerciseId));
}
