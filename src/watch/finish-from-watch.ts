// Saving a workout finished on the watch, which the phone does at once, as its own Save does
// (ADR 0118). The finish is kept in the workout until it is saved, so that one the app was ended
// on before it was saved is saved once the app runs again, rather than lost to the watch.
import { useEffect, useEffectEvent } from 'react';

import { useCloseSessionScreens } from '@/sessions/close-screens';
import { useSaveWorkout } from '@/sessions/save-workout';
import {
  activeSession,
  endOfWatchFinish,
  setsToSave,
  updateSession,
  type Session,
} from '@/sessions/session';

import { isFor, markApplied, type WatchCommand } from './protocol';

export type FinishCommand = Extract<WatchCommand, { type: 'finish' }>;

/** The workout with the watch's finish kept to be saved, unless one is kept already. */
export function keepFinish(session: Session, command: FinishCommand): Session {
  return isFor(session, command) && !session.watchFinish
    ? { ...session, watchFinish: { id: command.id, at: command.at } }
    : session;
}

/**
 * The workout with its kept finish given up, as the phone could not save it: recorded as applied,
 * which tells the watch that the workout goes on.
 */
function giveUpFinish(session: Session): Session {
  const kept = session.watchFinish;
  return kept ? { ...markApplied(session, kept.id), watchFinish: undefined } : session;
}

/**
 * Saves the finish the workout keeps, and ends it, closing the workout's screens, as the phone's
 * Save does; or gives the finish up when it cannot be saved.
 */
export function useFinishFromWatch(session: Session | null) {
  const { save } = useSaveWorkout();
  const closeScreens = useCloseSessionScreens();

  const finish = useEffectEvent(async (id: string) => {
    const current = activeSession();
    const kept = current?.watchFinish;
    if (!current || kept?.id !== id) return;
    try {
      const endedAt = endOfWatchFinish(current, kept.at);
      // The phone saves none without a set done, nor does the watch offer it.
      if (setsToSave(current, endedAt) === 0) {
        updateSession(giveUpFinish);
        return;
      }
      await save(current, endedAt);
      if (activeSession() === null) closeScreens();
    } catch (error) {
      console.warn('Could not save the workout finished on the watch', error);
      updateSession(giveUpFinish);
    }
  });

  const kept = session?.watchFinish?.id;
  useEffect(() => {
    if (kept) void finish(kept);
  }, [kept]);
}
