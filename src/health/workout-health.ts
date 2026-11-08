// What a watch measured during a finished workout, read from the phone's health store (#85,
// ADR 0098, ADR 0099). Nothing is read while the user has not connected the store (ADR 0097).
// set_workout_health() decides what of a read is kept; this side reads, sends and shows.
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useNow } from '@/lib/use-now';

import { isHealthConnected, useHealthConnected } from './connection';
import { workoutStats } from './platform';
import type { WorkoutStats } from './types';

/** How long after a workout its data is looked for. */
export const READ_FOR_MS = 24 * 3600 * 1000;

/** The heart rates set_workout_health() keeps, to show only what it would keep. */
const HEART_RATE_RANGE = [25, 250] as const;

const inRange = (bpm: number) => {
  const rounded = Math.round(bpm);
  return rounded >= HEART_RATE_RANGE[0] && rounded <= HEART_RATE_RANGE[1];
};

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

/** Whether a read has a heart rate a person can have, which it is kept and shown with. */
export function hasHeartRate(
  stats: WorkoutStats | null | undefined,
): stats is WorkoutStats & { heartRate: NonNullable<WorkoutStats['heartRate']> } {
  return !!stats?.heartRate && inRange(stats.heartRate.average) && inRange(stats.heartRate.max);
}

/** Sends a read to a log; whether it changed what the log keeps. */
export async function keepWorkoutHealth(logId: number, stats: WorkoutStats): Promise<boolean> {
  if (!stats.heartRate) return false;
  const { data, error } = await supabase.rpc('set_workout_health', {
    log_id: logId,
    heart_rate_avg: stats.heartRate.average,
    heart_rate_max: stats.heartRate.max,
    ...(stats.activeKcal !== null ? { active_kcal: stats.activeKcal } : {}),
    ...(stats.source ? { source: stats.source } : {}),
    // A sample the store had none for is sent as none, which the function keeps as a gap.
    ...(stats.samples ? { heart_rate_samples: stats.samples as number[] } : {}),
  });
  if (error) throw error;
  return data === true;
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
