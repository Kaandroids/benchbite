import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { isoWeekday } from '@/i18n/dates';
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
  sets: number;
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

/** Whole minutes between the start and the end of a workout. */
export function durationMinutes(log: Pick<LogSummary, 'startedAt' | 'finishedAt'>): number {
  return Math.round((log.finishedAt.getTime() - log.startedAt.getTime()) / 60_000);
}

export async function fetchLogSummaries(): Promise<LogSummary[]> {
  const { data, error } = await supabase
    .from('workout_log_summaries')
    .select('*')
    .order('finished_at', { ascending: false });
  if (error) {
    throw error;
  }
  return data.map((row) => ({
    id: row.id ?? 0,
    workoutId: row.workout_id,
    name: row.name,
    type: row.type,
    startedAt: new Date(row.started_at ?? 0),
    finishedAt: new Date(row.finished_at ?? 0),
    exercises: row.exercises ?? 0,
    sets: row.sets ?? 0,
    kilograms: Number(row.kilograms ?? 0),
    estimatedKcal: row.estimated_kcal,
  }));
}

/** The signed-in user's finished workouts, latest first. */
export function useLogSummaries() {
  return useQuery({ queryKey: LOGS_KEY, queryFn: fetchLogSummaries });
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
    // Removed from the list at once, so that the screen it was deleted from can close.
    onSuccess: (_data, id) => {
      queryClient.setQueryData<LogSummary[]>(LOGS_KEY, (logs) =>
        logs?.filter((log) => log.id !== id),
      );
      void queryClient.invalidateQueries({ queryKey: LOGS_KEY });
    },
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
