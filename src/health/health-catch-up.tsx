// Keeping what a watch measured on the logs it belongs to (ADR 0099). Watch apps write to the
// phone's health store late or in parts, so for a day after a workout its log is read again each
// time the app comes to the front, and each read is sent; set_workout_health() keeps what changed.
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { LOGS_KEY, recentLogs } from '@/history/history';
import { useUserId } from '@/providers/session-provider';

import { HEALTH_READS, isHealthConnected, useHealthConnected } from './connection';
import type { WorkoutStats } from './types';
import { READ_KINDS } from './read-kinds';
import { keepWorkoutHealth, READ_FOR_MS, readWorkoutHealth } from './workout-health';
import { saveRecentWorkouts } from './workout-write';

/**
 * Keeps what was read for a workout just saved, and refreshes the logs when it changed them. Saving
 * the log and this are two calls: one that fails is read again by the catch-up (ADR 0099).
 */
export function keepNewLogHealth(
  queryClient: QueryClient,
  logId: number,
  stats: WorkoutStats,
): Promise<void> {
  return keepWorkoutHealth(logId, stats)
    .then(async (changed) => {
      if (changed) await queryClient.invalidateQueries({ queryKey: LOGS_KEY });
    })
    .catch((error: unknown) => console.warn('Could not keep the watch’s data', error));
}

/** Reads the logs of the last day again and sends each read; whether any log changed. */
export async function catchUpWorkoutHealth(queryClient: QueryClient): Promise<boolean> {
  if (!isHealthConnected()) return false;
  let changed = false;
  for (const log of await recentLogs(new Date(Date.now() - READ_FOR_MS))) {
    try {
      const stats = await readWorkoutHealth(log.startedAt, log.finishedAt);
      if (stats) changed = (await keepWorkoutHealth(log.id, stats)) || changed;
    } catch (error) {
      // A log deleted meanwhile, or a failed call: the others go on.
      console.warn('Could not keep the watch’s data of a workout', error);
    }
  }
  if (changed) await queryClient.invalidateQueries({ queryKey: LOGS_KEY });
  return changed;
}

/** The catch-up running now and whose it is, so that coming to the front again starts no other. */
let running: { userId: string; done: Promise<unknown> } | null = null;

/**
 * Catches up on the last day's logs and saves them to the store, and takes the store's new weights
 * and steps, as the app starts and each time it comes to the front.
 */
export function HealthCatchUp() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  const connected = useHealthConnected();
  useEffect(() => {
    if (!userId || !connected) return;
    const run = () => {
      if (running?.userId === userId) return;
      const current = {
        userId,
        done: Promise.all([
          catchUpWorkoutHealth(queryClient)
            .catch((error: unknown) =>
              console.warn('Could not catch up on the workouts’ health data', error),
            )
            .then(() => saveRecentWorkouts(queryClient))
            .catch((error: unknown) =>
              console.warn('Could not save the workouts to the health store', error),
            ),
          ...HEALTH_READS.map((kind) =>
            READ_KINDS[kind]
              .bringIn(queryClient)
              .catch((error: unknown) =>
                console.warn(`Could not take the ${kind} from the health store`, error),
              ),
          ),
        ]).finally(() => {
          if (running === current) running = null;
        }),
      };
      running = current;
    };
    run();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => subscription.remove();
  }, [userId, connected, queryClient]);
  return null;
}
