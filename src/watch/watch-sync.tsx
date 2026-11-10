// Keeps the watch on the workout in progress (ADR 0109): every change of the workout is sent to
// it, and its commands are applied to the workout, wherever the app is in it.
import { useEffect } from 'react';

import { findExercise, useExerciseLibrary } from '@/exercises/library';
import { useUserId } from '@/providers/session-provider';
import { updateSession, useActiveSession } from '@/sessions/session';

import { link } from './link';
import { applyCommand, parseCommand, stateOf } from './protocol';

let lastSeq = 0;

/** A number above the last one, from the clock so that it keeps growing after the app restarts. */
function nextSeq(): number {
  lastSeq = Math.max(Date.now(), lastSeq + 1);
  return lastSeq;
}

/** Sends the workout to the watch and applies what the watch sends. */
export function WatchSync() {
  const session = useActiveSession(useUserId());
  const library = useExerciseLibrary();

  useEffect(() => {
    const name = (id: string) => findExercise(library.data, id)?.name ?? '';
    link.sendState(stateOf(session, name, nextSeq()));
  }, [session, library.data]);

  useEffect(
    () =>
      link.onCommand((message) => {
        const command = parseCommand(message);
        if (command) {
          updateSession((current) => applyCommand(current, command));
        } else {
          console.warn('Dropped a message from the watch that is not a command');
        }
      }),
    [],
  );

  return null;
}
