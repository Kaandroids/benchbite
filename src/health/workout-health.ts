// What a watch measured during a finished workout, read from the phone's health store and kept on
// its log (#85, ADR 0098). Nothing is read while the user has not connected the store (ADR 0097).
// Some watch apps write to the store late, so a log still missing a value is read again, for a
// day, each time the app comes to the front; only the values still missing are sent.
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';
import { useUserId } from '@/providers/session-provider';

import { isHealthConnected, useHealthConnected } from './connection';
import { workoutStats } from './platform';
import type { WorkoutStats } from './types';

/** How long after a workout its data is looked for. */
export const READ_FOR_MS = 24 * 3600 * 1000;

/** What a log already keeps, to send only what it lacks. */
export type KeptHealth = { heartRateMax: number | null; activeKcal: number | null };

/** The stats between two times, or none when the store is not connected or cannot be read. */
export async function readWorkoutHealth(from: Date, to: Date): Promise<WorkoutStats | null> {
  if (!isHealthConnected()) return null;
  try {
    return await workoutStats(from, to);
  } catch (error) {
    console.warn('Could not read the workout from the health store', error);
    return null;
  }
}

/** Whether the stats hold anything worth showing. */
export function measuredAnything(stats: WorkoutStats | null | undefined): stats is WorkoutStats {
  return !!stats && (stats.maxBpm !== null || stats.activeKcal !== null);
}

/**
 * Keeps on a log the values it still lacks: the heart rate as a pair, and the calories. Whether
 * anything was sent.
 */
export async function keepWorkoutHealth(
  logId: number,
  kept: KeptHealth,
  stats: WorkoutStats,
): Promise<boolean> {
  const heartRate =
    kept.heartRateMax === null && stats.averageBpm !== null && stats.maxBpm !== null;
  const calories = kept.activeKcal === null && stats.activeKcal !== null;
  if (!heartRate && !calories) return false;
  const { error } = await supabase.rpc('set_workout_health', {
    log_id: logId,
    ...(heartRate ? { heart_rate_avg: stats.averageBpm!, heart_rate_max: stats.maxBpm! } : {}),
    ...(calories ? { active_kcal: stats.activeKcal! } : {}),
    ...(stats.source ? { source: stats.source } : {}),
  });
  if (error) throw error;
  return true;
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

type MissingRow = {
  id: number | null;
  started_at: string | null;
  finished_at: string | null;
  heart_rate_max: number | null;
  active_kcal: number | null;
};

/** Reads again the logs of the last day still missing a value; whether any gained one. */
export async function catchUpWorkoutHealth(queryClient: QueryClient): Promise<boolean> {
  if (!isHealthConnected()) return false;
  const { data, error } = await supabase
    .from('workout_log_summaries')
    .select('id, started_at, finished_at, heart_rate_max, active_kcal')
    .gte('finished_at', new Date(Date.now() - READ_FOR_MS).toISOString())
    .or('heart_rate_max.is.null,active_kcal.is.null')
    .limit(20);
  if (error) throw error;
  let gained = false;
  for (const row of (data ?? []) as MissingRow[]) {
    if (row.id === null || !row.started_at || !row.finished_at) continue;
    const stats = await readWorkoutHealth(new Date(row.started_at), new Date(row.finished_at));
    if (!stats) continue;
    const kept = { heartRateMax: row.heart_rate_max, activeKcal: row.active_kcal };
    gained = (await keepWorkoutHealth(row.id, kept, stats)) || gained;
  }
  if (gained) {
    await queryClient.invalidateQueries({ queryKey: ['workout-logs'] });
  }
  return gained;
}

/** Catches up on the last day's logs as the app starts and each time it comes to the front. */
export function WorkoutHealthCatchUp() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  const connected = useHealthConnected();
  useEffect(() => {
    if (!userId || !connected) return;
    const run = () =>
      void catchUpWorkoutHealth(queryClient).catch((error: unknown) =>
        console.warn('Could not catch up on the workouts’ health data', error),
      );
    run();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => subscription.remove();
  }, [userId, connected, queryClient]);
  return null;
}
