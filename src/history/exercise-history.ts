import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Workout } from '@/workouts/workouts';

import { LOGS_KEY, type SetValues } from './history';

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

/** A set's place in its workout: the exercise's place, and the set's place within it, from 0. */
export type SetPlace = { exercise: number; set: number };

/** The best an exercise has been done, and the set that did it (the workout's total for most_time). */
export type ExerciseRecord = {
  kind: RecordKind;
  value: number;
  set: SetValues;
  logId: number;
  achievedAt: Date;
  /** Where the set is in its workout; null for most_time, which is no single set. */
  place: SetPlace | null;
};

/** What an exercise came to in one workout; null where the exercise does not record it. */
export type ProgressPoint = {
  logId: number;
  startedAt: Date;
  heaviestKg: number | null;
  oneRepMaxKg: number | null;
  volumeKg: number | null;
  mostReps: number | null;
  totalReps: number | null;
  longestSeconds: number | null;
  totalSeconds: number | null;
  longestMeters: number | null;
  /** Seconds per kilometre; lower is faster. */
  bestPace: number | null;
};

/** The sets of an exercise in one finished workout. */
export type ExerciseSession = {
  logId: number;
  startedAt: Date;
  name: string | null;
  type: Workout['type'];
  sets: (SetValues & { place: SetPlace })[];
};

/** The workouts whose sets are listed; the chart and the records still see every workout. */
export const SESSION_LIMIT = 50;

export type ExerciseHistory = {
  records: ExerciseRecord[];
  /** Oldest first, for the chart. */
  progress: ProgressPoint[];
  /** The latest SESSION_LIMIT workouts, latest first. */
  sessions: ExerciseSession[];
};

// Postgres numerics arrive as numbers, and the generated types do not say they can be null.
const numberOrNull = (value: number | null | undefined) =>
  value === null || value === undefined ? null : Number(value);

type SetRow = {
  log_id: number;
  exercise_position: number;
  set_position: number;
  weight_kg: number | null;
  reps: number | null;
  seconds: number | null;
  meters: number | null;
  workout_logs: { started_at: string; name: string | null; type: Workout['type'] } | null;
};

/** The sets of an exercise by the workout they were done in, latest first, each in its order. */
export function bySession(rows: readonly SetRow[]): ExerciseSession[] {
  const sorted = [...rows].sort(
    (a, b) =>
      a.log_id - b.log_id ||
      a.exercise_position - b.exercise_position ||
      a.set_position - b.set_position,
  );
  const sessions = new Map<number, ExerciseSession>();
  for (const row of sorted) {
    let session = sessions.get(row.log_id);
    if (!session) {
      session = {
        logId: row.log_id,
        startedAt: new Date(row.workout_logs?.started_at ?? 0),
        name: row.workout_logs?.name ?? null,
        type: row.workout_logs?.type ?? null,
        sets: [],
      };
      sessions.set(row.log_id, session);
    }
    session.sets.push({
      weightKg: numberOrNull(row.weight_kg),
      reps: row.reps,
      seconds: row.seconds,
      meters: row.meters,
      place: { exercise: row.exercise_position, set: row.set_position },
    });
  }
  return [...sessions.values()].sort(
    (a, b) => b.startedAt.getTime() - a.startedAt.getTime() || b.logId - a.logId,
  );
}

/** The sets that set a record, as the index of the set in each session, by the record's place. */
export function recordSets(
  records: readonly ExerciseRecord[],
  sessions: readonly ExerciseSession[],
): Map<number, Set<number>> {
  const marked = new Map<number, Set<number>>();
  for (const { logId, place } of records) {
    const index =
      sessions
        .find((session) => session.logId === logId)
        ?.sets.findIndex(
          (set) => place && set.place.exercise === place.exercise && set.place.set === place.set,
        ) ?? -1;
    if (index >= 0) {
      marked.set(logId, (marked.get(logId) ?? new Set()).add(index));
    }
  }
  return marked;
}

/**
 * An exercise's records and progress over every finished workout of the signed-in user, and its
 * sets in the latest of them. The sets are read for those workouts only, so that a long history
 * stays within the rows a request returns.
 */
export function useExerciseHistory(exerciseId: string) {
  return useQuery({
    queryKey: [...LOGS_KEY, 'exercise', exerciseId],
    queryFn: async (): Promise<ExerciseHistory> => {
      const [records, progress] = await Promise.all([
        supabase.rpc('exercise_records', { exercise_id: exerciseId }),
        supabase.rpc('exercise_progress', { exercise_id: exerciseId }),
      ]);
      if (records.error) {
        throw records.error;
      }
      if (progress.error) {
        throw progress.error;
      }
      const latest = progress.data.slice(-SESSION_LIMIT).map((row) => row.log_id);
      const sets = await supabase
        .from('logged_sets')
        .select(
          'log_id, exercise_position, set_position, weight_kg, reps, seconds, meters, workout_logs(started_at, name, type)',
        )
        .eq('exercise_id', exerciseId)
        .in('log_id', latest);
      if (sets.error) {
        throw sets.error;
      }
      return {
        records: records.data
          .filter((row): row is typeof row & { kind: RecordKind } =>
            (RECORD_KINDS as readonly string[]).includes(row.kind),
          )
          .sort((a, b) => RECORD_KINDS.indexOf(a.kind) - RECORD_KINDS.indexOf(b.kind))
          .map((row) => ({
            kind: row.kind,
            value: Number(row.value),
            set: {
              weightKg: numberOrNull(row.weight_kg),
              reps: numberOrNull(row.reps),
              seconds: numberOrNull(row.seconds),
              meters: numberOrNull(row.meters),
            },
            logId: row.log_id,
            achievedAt: new Date(row.achieved_at),
            place:
              row.exercise_position === null || row.set_position === null
                ? null
                : { exercise: row.exercise_position, set: row.set_position },
          })),
        progress: progress.data.map((row) => ({
          logId: row.log_id,
          startedAt: new Date(row.started_at),
          heaviestKg: numberOrNull(row.heaviest_kg),
          oneRepMaxKg: numberOrNull(row.one_rep_max_kg),
          volumeKg: numberOrNull(row.volume_kg),
          mostReps: numberOrNull(row.most_reps),
          totalReps: numberOrNull(row.total_reps),
          longestSeconds: numberOrNull(row.longest_seconds),
          totalSeconds: numberOrNull(row.total_seconds),
          longestMeters: numberOrNull(row.longest_meters),
          bestPace: numberOrNull(row.best_pace),
        })),
        sessions: bySession(sets.data),
      };
    },
  });
}
