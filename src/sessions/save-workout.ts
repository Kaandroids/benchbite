// Saving the workout in progress, which the phone's Save, a workout left open and a finish from the
// watch all do the same way; each keeps only what it does after.
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { afterWorkoutLogged } from '@/health/health-catch-up';
import type { WorkoutStats } from '@/health/types';
import { isDbError } from '@/lib/errors';
import { reloadPlan } from '@/workouts/workouts';

import { useLogWorkout } from './logs';
import { activeSession, endSession, stopClock, toLog, type Session } from './session';

/**
 * Saves the workout as ended at `endedAt`, with what the watch measured, and ends it, unless it
 * was ended meanwhile; the log's id. A clock still running logs its set, as stopping it then
 * would. A failed save throws, and leaves the workout as it was.
 */
export function useSaveWorkout() {
  const { mutateAsync, isPending } = useLogWorkout();
  const queryClient = useQueryClient();

  const save = useCallback(
    async (session: Session, endedAt: number, health: WorkoutStats | null = null) => {
      let logId: number;
      try {
        logId = await mutateAsync(toLog(stopClock(session, endedAt), endedAt));
      } catch (error) {
        // The workout already waited for premium when this session started, as from a list cached
        // before the plan changed: the list is loaded again to show it locked.
        if (isDbError(error, 'waitsForPremium')) {
          void reloadPlan(queryClient);
        }
        throw error;
      }
      // What the watch measured goes with it, and it is saved to the health store (ADR 0105).
      void afterWorkoutLogged(queryClient, logId, health, {
        followedOnWatch: !!session.watchFollows,
      });
      if (activeSession()?.id === session.id) {
        endSession({ saved: true, endedAt });
      }
      return logId;
    },
    [mutateAsync, queryClient],
  );

  return { save, isPending };
}
