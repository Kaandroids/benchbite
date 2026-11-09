// Saving finished workouts to the phone's health store (#479, ADR 0105). For a day after a workout,
// each catch-up brings the store in line with its log: Benchbite's copy is saved, saved again when
// the log's calories changed, and taken out when a watch's app recorded the workout after all.
import { useQuery, type QueryClient } from '@tanstack/react-query';

import { recentLogs } from '@/history/history';

import {
  mayWrite,
  setWriteSince,
  useHealthConnected,
  useWritingWorkouts,
  writeSince,
} from './connection';
import { oneAtATimeThenAgain } from './import-guard';
import { removeWorkout, saveWorkout, storedWorkouts, writeAllowed } from './platform';
import type { StoredWorkouts } from './types';
import { READ_FOR_MS } from './workout-health';

/** Where a workout is in the store: saved by Benchbite, or recorded by another app, as a watch's. */
export type SavedToHealth = 'saved' | 'recorded';

type LogToSave = { id: number; startedAt: Date; finishedAt: Date; kcal: number | null };

export const SAVED_TO_HEALTH_KEY = ['saved-to-health'] as const;

const sameKcal = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.round(a) === Math.round(b);

/** Where a workout is, by what the store holds in its time. */
const whereStored = (stored: StoredWorkouts): SavedToHealth | null =>
  stored.others ? 'recorded' : stored.ours ? 'saved' : null;

/** Brings the store in line with a log; where the workout is now, or null when it is not saved. */
export async function saveToHealth(log: LogToSave): Promise<SavedToHealth | null> {
  if (!mayWrite() || log.finishedAt < writeSince()!) return null;
  const stored = await storedWorkouts(log.id, log.startedAt, log.finishedAt);
  if (whereStored(stored) === 'recorded') {
    if (stored.ours) await removeWorkout(log.id);
    return 'recorded';
  }
  if (!stored.ours || !sameKcal(stored.ours.activeKcal, log.kcal)) {
    await saveWorkout({
      logId: log.id,
      start: log.startedAt,
      end: log.finishedAt,
      activeKcal: log.kcal,
    });
  }
  return 'saved';
}

/**
 * Saves the workouts of the last day, once at a time; one that fails is tried again the next time.
 * A call during a run, as for a workout just finished, gets a run after it. Whether any was looked
 * at.
 */
const saveRecent = oneAtATimeThenAgain(async (): Promise<boolean> => {
  if (!mayWrite()) return false;
  // The system may have taken writing back since, which turns saving off (ADR 0105).
  if (!(await writeAllowed())) {
    setWriteSince(null);
    return false;
  }
  const logs = await recentLogs(new Date(Date.now() - READ_FOR_MS));
  for (const log of logs) {
    try {
      await saveToHealth(log);
    } catch (error) {
      console.warn('Could not save a workout to the health store', error);
    }
  }
  return logs.length > 0;
});

/** Saves the last day's workouts, and refreshes what the logs show about them. */
export async function saveRecentWorkouts(queryClient: QueryClient): Promise<void> {
  if (await saveRecent()) {
    await queryClient.invalidateQueries({ queryKey: SAVED_TO_HEALTH_KEY });
  }
}

/** Where a logged workout is in the store, while workouts are saved to it. */
export function useSavedToHealth(
  log: { id: number; startedAt: Date; finishedAt: Date } | null | undefined,
): SavedToHealth | null {
  const connected = useHealthConnected();
  const writing = useWritingWorkouts();
  const { data } = useQuery({
    queryKey: [...SAVED_TO_HEALTH_KEY, log?.id],
    queryFn: async () =>
      whereStored(await storedWorkouts(log!.id, log!.startedAt, log!.finishedAt)),
    enabled: connected && writing && !!log,
    staleTime: 60_000,
  });
  return connected && writing ? (data ?? null) : null;
}
