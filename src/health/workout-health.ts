// What a watch measured during a finished workout, read from the phone's health store and kept on
// its log (#85, ADR 0098, ADR 0099). Nothing is read while the user has not connected the store
// (ADR 0097). Watch apps write to the store late or in parts, so for a day after a workout its log
// is read again each time the app comes to the front, and what each read found is kept.
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { LOGS_KEY } from '@/history/history';
import { supabase } from '@/lib/supabase';
import { useNow } from '@/lib/use-now';
import { useUserId } from '@/providers/session-provider';

import { isHealthConnected, useHealthConnected } from './connection';
import { workoutStats } from './platform';
import { NO_WORKOUT_STATS, type WorkoutStats } from './types';

/** How long after a workout its data is looked for. */
const READ_FOR_MS = 24 * 3600 * 1000;

/** The heart rates a person can have, as set_workout_health() keeps them. */
const HEART_RATE_RANGE = [25, 250] as const;

const inRange = (bpm: number | null) =>
  bpm !== null && bpm >= HEART_RATE_RANGE[0] && bpm <= HEART_RATE_RANGE[1];

/**
 * What of a read can be shown and kept. A heart rate counts only as a pair a person can have, so a
 * sensor's spike leaves it out; calories count only with it, as a phone counts some from motion
 * alone, which no watch measured.
 */
export function usableStats(stats: WorkoutStats): WorkoutStats {
  if (!inRange(stats.averageBpm) || !inRange(stats.maxBpm)) return NO_WORKOUT_STATS;
  return stats;
}

/** The usable stats between two times, or none when the store is not connected or cannot be read. */
export async function readWorkoutHealth(from: Date, to: Date): Promise<WorkoutStats | null> {
  if (!isHealthConnected()) return null;
  try {
    return usableStats(await workoutStats(from, to));
  } catch (error) {
    console.warn('Could not read the workout from the health store', error);
    return null;
  }
}

/** Whether the stats hold anything worth showing. */
export function measuredAnything(stats: WorkoutStats | null | undefined): stats is WorkoutStats {
  return !!stats && stats.maxBpm !== null;
}

/**
 * Keeps on a log what a read found: the heart rate as a pair, and the calories. What it did not
 * find keeps what the log has (ADR 0099). Whether anything was sent.
 */
export async function keepWorkoutHealth(logId: number, stats: WorkoutStats): Promise<boolean> {
  if (!measuredAnything(stats)) return false;
  const { error } = await supabase.rpc('set_workout_health', {
    log_id: logId,
    heart_rate_avg: stats.averageBpm!,
    heart_rate_max: stats.maxBpm!,
    ...(stats.activeKcal !== null ? { active_kcal: stats.activeKcal } : {}),
    ...(stats.source ? { source: stats.source } : {}),
  });
  if (error) throw error;
  return true;
}

/** Keeps what was read for a workout just saved, and refreshes the logs; reads again later if not. */
export function keepNewLogHealth(queryClient: QueryClient, logId: number, stats: WorkoutStats) {
  void keepWorkoutHealth(logId, stats)
    .then(async (kept) => {
      if (kept) await queryClient.invalidateQueries({ queryKey: LOGS_KEY });
    })
    .catch((error: unknown) => console.warn('Could not keep the watch’s data', error));
}

/** What the store measured for the workout on the finish screen, read once its times are known. */
export function useWorkoutHealth(from: number, to: number) {
  const connected = useHealthConnected();
  return useQuery({
    queryKey: ['workout-health', from, to],
    queryFn: () => readWorkoutHealth(new Date(from), new Date(to)),
    enabled: connected && from > 0 && to > from,
    staleTime: 60_000,
  });
}

/**
 * Whether a finished workout still waits for the watch: connected, within a day, and no heart rate
 * yet. False while the workout is not loaded.
 */
export function useAwaitingWatch(
  log: { finishedAt: Date; heartRateMax: number | null } | null | undefined,
): boolean {
  const connected = useHealthConnected();
  const now = useNow(false);
  return (
    !!log && connected && log.heartRateMax === null && now - log.finishedAt.getTime() < READ_FOR_MS
  );
}

/** Reads again the logs of the last day and keeps what each read found; whether any changed. */
export async function catchUpWorkoutHealth(queryClient: QueryClient): Promise<boolean> {
  if (!isHealthConnected()) return false;
  const { data, error } = await supabase
    .from('workout_log_summaries')
    .select('id, started_at, finished_at')
    .gte('finished_at', new Date(Date.now() - READ_FOR_MS).toISOString())
    .limit(20);
  if (error) throw error;
  let kept = false;
  for (const row of data ?? []) {
    if (row.id === null || !row.started_at || !row.finished_at) continue;
    const stats = await readWorkoutHealth(new Date(row.started_at), new Date(row.finished_at));
    if (stats) kept = (await keepWorkoutHealth(row.id, stats)) || kept;
  }
  if (kept) await queryClient.invalidateQueries({ queryKey: LOGS_KEY });
  return kept;
}

/** The catch-up running now, so that the app coming to the front again does not start another. */
let running: Promise<unknown> | null = null;

/** Catches up on the last day's logs as the app starts and each time it comes to the front. */
export function WorkoutHealthCatchUp() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  const connected = useHealthConnected();
  useEffect(() => {
    if (!userId || !connected) return;
    const run = () => {
      running ??= catchUpWorkoutHealth(queryClient)
        .catch((error: unknown) =>
          console.warn('Could not catch up on the workouts’ health data', error),
        )
        .finally(() => {
          running = null;
        });
    };
    run();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => subscription.remove();
  }, [userId, connected, queryClient]);
  return null;
}
