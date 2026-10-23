import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { isoWeekday, toIsoDate } from '@/i18n/dates';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import type { Workout } from '@/workouts/workouts';

const LOGS_KEY = ['workout-logs'];

/** A finished workout at a glance (workout_log_summaries). */
export type LogSummary = {
  id: number;
  workoutId: number | null;
  name: string | null;
  type: Workout['type'];
  startedAt: Date;
  finishedAt: Date;
  exercises: number;
  /** What the workout had when it started; null for logs saved before this was kept. */
  plannedExercises: number | null;
  sets: number;
  plannedSets: number | null;
  kilograms: number;
  /** Estimated from the time and the user's weight; null without a weight. */
  estimatedKcal: number | null;
};

/** A set of a finished workout. */
export type LoggedSet = {
  exercisePosition: number;
  exerciseId: string;
  weightKg: number | null;
  reps: number | null;
  seconds: number | null;
  meters: number | null;
};

/** Whether less was done than planned. */
export function isPartial(done: number, planned: number | null): planned is number {
  return planned !== null && done < planned;
}

/** "7/8" when less was done than planned, else just what was done. */
export function doneOf(done: number, planned: number | null): string {
  return isPartial(done, planned) ? `${done}/${planned}` : String(done);
}

/** Whole minutes between the start and the end of a workout. */
export function durationMinutes(log: Pick<LogSummary, 'startedAt' | 'finishedAt'>): number {
  return Math.round((log.finishedAt.getTime() - log.startedAt.getTime()) / 60_000);
}

type SummaryRow = Database['public']['Views']['workout_log_summaries']['Row'];

function toSummary(row: SummaryRow): LogSummary {
  return {
    id: row.id ?? 0,
    workoutId: row.workout_id,
    name: row.name,
    type: row.type,
    startedAt: new Date(row.started_at ?? 0),
    finishedAt: new Date(row.finished_at ?? 0),
    exercises: row.exercises ?? 0,
    plannedExercises: row.planned_exercises,
    sets: row.sets ?? 0,
    plannedSets: row.planned_sets,
    kilograms: Number(row.kilograms ?? 0),
    estimatedKcal: row.estimated_kcal,
  };
}

/** Finished workouts, latest first; the latest `limit` of them when given. */
export async function fetchLogSummaries(limit?: number): Promise<LogSummary[]> {
  const query = supabase
    .from('workout_log_summaries')
    .select('*')
    .order('finished_at', { ascending: false });
  const { data, error } = await (limit === undefined ? query : query.limit(limit));
  if (error) {
    throw error;
  }
  return data.map(toSummary);
}

/** Every finished workout of the signed-in user, latest first. */
export function useLogSummaries() {
  return useQuery({ queryKey: [...LOGS_KEY, 'all'], queryFn: () => fetchLogSummaries() });
}

/** The latest finished workouts and how many were done this week, for the Workout tab. */
export function useRecentLogs(count: number) {
  return useQuery({
    queryKey: [...LOGS_KEY, 'recent', count],
    queryFn: async () => {
      const [latest, week] = await Promise.all([
        fetchLogSummaries(count),
        supabase
          .from('workout_logs')
          .select('id', { count: 'exact', head: true })
          .gte('started_at', weekStart(new Date()).toISOString()),
      ]);
      if (week.error) {
        throw week.error;
      }
      return { latest, thisWeek: week.count ?? 0 };
    },
  });
}

/** The dates as YYYY-MM-DD of the workouts finished in the week of `today`, for the Today tab. */
export function useFinishedThisWeek(today: Date) {
  const start = weekStart(today);
  return useQuery({
    queryKey: [...LOGS_KEY, 'week', start.getTime()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_logs')
        .select('started_at')
        .gte('started_at', start.toISOString());
      if (error) {
        throw error;
      }
      return data.map((row) => toIsoDate(new Date(row.started_at)));
    },
  });
}

/** One finished workout, or null when it does not exist. */
export function useLogSummary(id: number) {
  return useQuery({
    queryKey: [...LOGS_KEY, id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_log_summaries')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data ? toSummary(data) : null;
    },
  });
}

/** The sets of one finished workout, in the order they were done. */
export function useLoggedSets(logId: number) {
  return useQuery({
    queryKey: [...LOGS_KEY, logId, 'sets'],
    queryFn: async (): Promise<LoggedSet[]> => {
      const { data, error } = await supabase
        .from('logged_sets')
        .select('exercise_position, set_position, exercise_id, weight_kg, reps, seconds, meters')
        .eq('log_id', logId)
        .order('exercise_position')
        .order('set_position');
      if (error) {
        throw error;
      }
      return data.map((row) => ({
        exercisePosition: row.exercise_position,
        exerciseId: row.exercise_id,
        weightKg: row.weight_kg,
        reps: row.reps,
        seconds: row.seconds,
        meters: row.meters,
      }));
    },
  });
}

/** Deletes a finished workout with its sets. */
export function useDeleteLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('workout_logs').delete().eq('id', id);
      if (error) {
        throw error;
      }
    },
    // Only the lists are loaded again; the deleted workout's own screen closes and its data is
    // dropped once nothing shows it, so that it never shows as not found meanwhile.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [...LOGS_KEY, 'all'] }),
        queryClient.invalidateQueries({ queryKey: [...LOGS_KEY, 'recent'] }),
        queryClient.invalidateQueries({ queryKey: [...LOGS_KEY, 'week'] }),
      ]),
  });
}

/** The Monday a week starts on, at midnight. */
export function weekStart(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - (isoWeekday(start) - 1));
  return start;
}

export type LogWeek = { start: Date; logs: LogSummary[]; minutes: number };

/** Finished workouts by the week they were done in, latest first. */
export function byWeek(logs: LogSummary[]): LogWeek[] {
  const weeks: LogWeek[] = [];
  for (const log of logs) {
    const start = weekStart(log.startedAt);
    let week = weeks.find((item) => item.start.getTime() === start.getTime());
    if (!week) {
      week = { start, logs: [], minutes: 0 };
      weeks.push(week);
    }
    week.logs.push(log);
    week.minutes += durationMinutes(log);
  }
  return weeks;
}
