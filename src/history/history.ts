import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { addDays, toIsoDate, weekStart } from '@/i18n/dates';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import type { SetValues } from '@/sets/values';
import { STREAK_KEY } from '@/streak/streak';
import type { WorkoutAlternative } from '@/workouts/alternatives';
import type { FinishedWorkout } from '@/workouts/week-schedule';
import type { Workout } from '@/workouts/workouts';

export const LOGS_KEY = ['workout-logs'];
/**
 * The query keys of the days trained (useDayTraining()), which logging, editing or deleting a
 * workout reloads, and changing the plan or moving a workout, which change what was missed.
 */
export const TRAINING_DAYS_KEY = [...LOGS_KEY, 'days'];
/** The query key of the records beaten across exercises (useRecordHistory()). */
export const RECORDS_KEY = [...LOGS_KEY, 'records'];

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
  /** What the watch measured, from the phone's health store (ADR 0098); null when nothing did. */
  heartRateAvg: number | null;
  heartRateMax: number | null;
  /** The app or watch that measured them. */
  healthSource: string | null;
  /**
   * The calories to show and where they come from (ADR 0104): the watch's, else estimated from the
   * heart rate, else from the minutes; null without any.
   */
  kcal: number | null;
  kcalSource: KcalSource | null;
  /** The workout's exercises when it started, in order; null for logs saved before they were kept. */
  plannedExerciseIds: string[] | null;
  /** The alternative it was done with (ADR 0069); null without alternatives and for older logs. */
  alternative: Pick<WorkoutAlternative, 'name' | 'position'> | null;
};

/** Where the calories a workout shows come from. */
export type KcalSource = Database['public']['Enums']['kcal_source'];

/** A set of a finished workout, with when it was done; none for one logged before this was kept. */
export type LoggedSet = SetValues & {
  exercisePosition: number;
  exerciseId: string;
  doneAt: Date | null;
};

/** The sets of one exercise of a finished workout, and its place in the workout from 0. */
export type LoggedExercise = { place: number; exerciseId: string; sets: LoggedSet[] };

/** The sets of a finished workout by exercise, in the order the exercises were done. */
export function byExercise(sets: readonly LoggedSet[]): LoggedExercise[] {
  const exercises: LoggedExercise[] = [];
  for (const set of sets) {
    const last = exercises[exercises.length - 1];
    if (last && last.exerciseId === set.exerciseId && last.place === set.exercisePosition) {
      last.sets.push(set);
    } else {
      exercises.push({ place: set.exercisePosition, exerciseId: set.exerciseId, sets: [set] });
    }
  }
  return exercises;
}

/**
 * The exercises of a finished workout and the ones it skipped, in the workout's order. A log keeps
 * each exercise's place in the workout, so a place without sets is an exercise that was skipped;
 * `planned` names the workout's exercises, as far as it still has them.
 */
export function withSkipped(
  sets: readonly LoggedSet[],
  planned: readonly string[],
): LoggedExercise[] {
  const logged = byExercise(sets);
  const byPlace = new Map(logged.map((exercise) => [exercise.place, exercise]));
  const loggedIds = new Set(logged.map((exercise) => exercise.exerciseId));
  const places = Math.max(planned.length, ...logged.map((exercise) => exercise.place + 1));
  const exercises: LoggedExercise[] = [];
  for (let place = 0; place < places; place++) {
    const done = byPlace.get(place);
    const skipped = planned[place];
    if (done) {
      exercises.push(done);
    } else if (skipped !== undefined && !loggedIds.has(skipped)) {
      // An exercise done elsewhere in the log was moved in the workout since, not skipped.
      exercises.push({ place, exerciseId: skipped, sets: [] });
    }
  }
  return exercises;
}

/** Whether less was done than planned. */
export function isPartial(done: number, planned: number | null): planned is number {
  return planned !== null && done < planned;
}

/** "7/8" when less was done than planned, else just what was done. */
export function doneOf(done: number, planned: number | null): string {
  return isPartial(done, planned) ? `${done}/${planned}` : String(done);
}

/**
 * The calories a workout burned, as the summary chooses them, and where they come from: only the
 * watch's are measured; none without any.
 */
export function kcalOf(
  log: Pick<LogSummary, 'kcal' | 'kcalSource'>,
): { kcal: number; source: KcalSource } | null {
  return log.kcal === null || log.kcalSource === null
    ? null
    : { kcal: log.kcal, source: log.kcalSource };
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
    heartRateAvg: row.heart_rate_avg,
    heartRateMax: row.heart_rate_max,
    healthSource: row.health_source,
    kcal: row.kcal,
    kcalSource: row.kcal_source,
    plannedExerciseIds: row.planned_exercise_ids,
    alternative:
      row.alternative_position === null
        ? null
        : { name: row.alternative_name, position: row.alternative_position },
  };
}

/**
 * Where a page of finished workouts ends: the last one's finish time as the database has it, which
 * is finer than a `Date` keeps, and its id.
 */
export type LogCursor = { finishedAt: string; id: number };

/** A page of finished workouts, and where the next one starts unless this one was the last. */
export type LogPage = { logs: LogSummary[]; next?: LogCursor };

/** The workouts finished since a time, with only their times, as the health catch-up reads them. */
export async function recentLogs(
  since: Date,
): Promise<{ id: number; startedAt: Date; finishedAt: Date }[]> {
  const { data, error } = await supabase
    .from('workout_log_summaries')
    .select('id, started_at, finished_at')
    .gte('finished_at', since.toISOString())
    .limit(20);
  if (error) throw error;
  return data.flatMap((row) =>
    row.id === null || !row.started_at || !row.finished_at
      ? []
      : [
          {
            id: row.id,
            startedAt: new Date(row.started_at),
            finishedAt: new Date(row.finished_at),
          },
        ],
  );
}

/** The latest `count` finished workouts, or the `count` before `after`, latest first. */
export async function fetchLogSummaries(count: number, after?: LogCursor): Promise<LogPage> {
  let query = supabase.from('workout_log_summaries').select('*');
  if (after) {
    // After the last workout shown rather than after a number of them, so that a workout saved or
    // deleted on another device meanwhile does not shift the pages.
    query = query.or(
      `finished_at.lt."${after.finishedAt}",and(finished_at.eq."${after.finishedAt}",id.lt.${after.id})`,
    );
  }
  const { data, error } = await query
    // By id too, so that workouts that finished at the same time have an order.
    .order('finished_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(count);
  if (error) {
    throw error;
  }
  const last = data[data.length - 1];
  return {
    logs: data.map(toSummary),
    // A short page is the last one.
    next:
      last && data.length === count
        ? { finishedAt: last.finished_at ?? '', id: last.id ?? 0 }
        : undefined,
  };
}

/** How many finished workouts a page of the history loads. */
export const LOG_PAGE_SIZE = 30;

/** The signed-in user's finished workouts, latest first, a page at a time. */
export function useLogSummaries() {
  return useInfiniteQuery({
    queryKey: [...LOGS_KEY, 'all'],
    queryFn: ({ pageParam }) => fetchLogSummaries(LOG_PAGE_SIZE, pageParam),
    initialPageParam: undefined as LogCursor | undefined,
    getNextPageParam: (lastPage) => lastPage.next,
  });
}

/** The latest finished workouts and how many were done this week, for the Workout tab. */
export function useRecentLogs(count: number) {
  return useQuery({
    queryKey: [...LOGS_KEY, 'recent', count],
    queryFn: async () => {
      const [latest, week] = await Promise.all([
        fetchLogSummaries(count).then((page) => page.logs),
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

/** The query key of the workouts finished in the week of `week`. */
export function finishedWeekKey(week: Date) {
  return [...LOGS_KEY, 'week', weekStart(week).getTime()];
}

/** The workouts finished in the week of `week`, with the day each started, for the Today tab. */
export function useFinishedInWeek(week: Date) {
  const start = weekStart(week);
  return useQuery({
    queryKey: finishedWeekKey(week),
    queryFn: async (): Promise<FinishedWorkout[]> => {
      const { data, error } = await supabase
        .from('workout_logs')
        .select('workout_id, started_at')
        .gte('started_at', start.toISOString())
        .lt('started_at', addDays(start, 7).toISOString());
      if (error) {
        throw error;
      }
      return data.map((row) => ({
        workoutId: row.workout_id,
        startedOn: toIsoDate(new Date(row.started_at)),
      }));
    },
  });
}

/** The query key of the workouts finished in the week of `week`, under the week's finished ones. */
export function weekLogsKey(week: Date) {
  return [...LOGS_KEY, 'week', 'logs', weekStart(week).getTime()];
}

/**
 * The workouts finished in the week of `week`, in the order they started, for a past week; not
 * loaded until `enabled`.
 */
export function useWeekLogs(week: Date, enabled = true) {
  const start = weekStart(week);
  return useQuery({
    queryKey: weekLogsKey(week),
    enabled,
    queryFn: async (): Promise<LogSummary[]> => {
      const { data, error } = await supabase
        .from('workout_log_summaries')
        .select('*')
        .gte('started_at', start.toISOString())
        .lt('started_at', addDays(start, 7).toISOString())
        .order('started_at')
        .order('id');
      if (error) {
        throw error;
      }
      return data.map(toSummary);
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
        .select(
          'exercise_position, set_position, exercise_id, weight_kg, reps, seconds, meters, done_at',
        )
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
        doneAt: row.done_at ? new Date(row.done_at) : null,
      }));
    },
  });
}

/**
 * A finished workout's heart rate every 10 seconds from its start (ADR 0104), none where nothing
 * measured it; null when the watch gave none.
 */
export function useHeartRateSamples(logId: number) {
  return useQuery({
    queryKey: [...LOGS_KEY, logId, 'heart-rate'],
    queryFn: async (): Promise<(number | null)[] | null> => {
      const { data, error } = await supabase
        .from('workout_logs')
        .select('heart_rate_samples')
        .eq('id', logId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data?.heart_rate_samples ?? null;
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
        queryClient.invalidateQueries({ queryKey: [...LOGS_KEY, 'exercise'] }),
        queryClient.invalidateQueries({ queryKey: TRAINING_DAYS_KEY }),
        queryClient.invalidateQueries({ queryKey: RECORDS_KEY }),
        queryClient.invalidateQueries({ queryKey: STREAK_KEY }),
      ]),
  });
}

/**
 * Replaces the sets of a finished workout; its time and calories stay as they were (ADR 0023). Each
 * set sends when it was done, which a set added in the edit has not (ADR 0104).
 */
export function useEditLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      exercises,
    }: {
      id: number;
      exercises: {
        place: number;
        exerciseId: string;
        sets: (SetValues & { doneAt: Date | null })[];
      }[];
    }) => {
      // The function takes an exercise's place from its index, so every place up to the last is
      // sent: exercises without sets, and gaps without an exercise, keep the others where they were.
      const places = Math.max(0, ...exercises.map((exercise) => exercise.place + 1));
      const byPlace = new Map(exercises.map((exercise) => [exercise.place, exercise]));
      const log = {
        exercises: Array.from({ length: places }, (_, place) => {
          const exercise = byPlace.get(place);
          return {
            exerciseId: exercise?.exerciseId ?? null,
            sets: (exercise?.sets ?? []).map(({ doneAt, ...values }) => ({
              ...values,
              doneAt: doneAt ? doneAt.toISOString() : null,
            })),
          };
        }),
      };
      const { error } = await supabase.rpc('edit_workout_log', { log_id: id, log });
      if (error) {
        throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LOGS_KEY }),
  });
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
