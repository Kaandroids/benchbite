// Saving a workout finished on the watch, which the phone does at once, as its own Save does
// (ADR 0118).
import { useQueryClient } from '@tanstack/react-query';
import { router, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { afterWorkoutLogged } from '@/health/health-catch-up';
import { useLogWorkout } from '@/sessions/logs';
import {
  activeSession,
  endOfWatchFinish,
  endSession,
  sessionTotals,
  stopClock,
  toLog,
  updateSession,
  type Session,
} from '@/sessions/session';

import { applyCommand, isFor, type WatchCommand } from './protocol';

export type FinishCommand = Extract<WatchCommand, { type: 'finish' }>;

/** The finishes being saved, so that one delivered twice is saved once. */
const saving = new Set<string>();

/**
 * Saves the workout the watch finished and ends it, closing the workout's screens, as the phone's
 * Save does. A finish it cannot save is applied without ending the workout, which tells the watch:
 * the workout goes on, to be finished again there or on the phone.
 */
export function useFinishFromWatch() {
  const logWorkout = useLogWorkout();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  // Where the app is once the save is done, which it may have left meanwhile.
  const path = useRef(pathname);
  useEffect(() => {
    path.current = pathname;
  }, [pathname]);

  return async (command: FinishCommand, userId: string | undefined) => {
    const session = activeSession();
    if (!session || session.userId !== userId || !isFor(session, command)) return;
    if (saving.has(command.id)) return;
    saving.add(command.id);
    const failed = () =>
      updateSession((current) => applyCommand(current, command, { metricsOf: () => undefined }));
    try {
      // The phone saves none without a set done, nor does the watch offer it.
      if (sessionTotals(session).done === 0) {
        failed();
        return;
      }
      const endedAt = endOfWatchFinish(session, command.at);
      const logId = await logWorkout.mutateAsync(toLog(stopClock(session, endedAt), endedAt));
      if (logId !== null) {
        void afterWorkoutLogged(queryClient, logId, null, {
          followedOnWatch: !!session.watchFollows,
        });
      }
      // Unless it was ended on the phone meanwhile.
      if (activeSession()?.id !== session.id) return;
      endSession({ saved: true, endedAt });
      if (path.current.startsWith('/session')) router.dismissAll();
    } catch (error) {
      console.warn('Could not save the workout finished on the watch', error);
      failed();
    } finally {
      saving.delete(command.id);
    }
  };
}
