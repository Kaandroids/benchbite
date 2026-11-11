// Keeps the watch on the workout in progress (ADR 0109): every change of the workout is sent to
// it, and its commands are applied to the workout, wherever the app is in it.
import { useEffect, useEffectEvent } from 'react';

import { findExercise, useExerciseLibrary, type LibraryExercise } from '@/exercises/library';
import { useUserId } from '@/providers/session-provider';
import { updateSession, useActiveSession } from '@/sessions/session';

import { link } from './link';
import { applyCommand, parseCommand, stateOf, type ExerciseOf } from './protocol';

let lastSeq = 0;

/** A number above the last one, from the clock so that it keeps growing after the app restarts. */
function nextSeq(): number {
  lastSeq = Math.max(Date.now(), lastSeq + 1);
  return lastSeq;
}

/**
 * The library's exercise of an id, which sending the state and applying commands both judge a set
 * by, so that the watch offers no Done the phone then refuses.
 */
const exerciseIn =
  (library: LibraryExercise[] | undefined): ExerciseOf =>
  (id) =>
    findExercise(library, id);

/** Sends the workout to the watch and applies what the watch sends. */
export function WatchSync() {
  const session = useActiveSession(useUserId());
  // Loaded only while a workout runs, which is all the watch shows.
  const library = useExerciseLibrary({ enabled: session !== null });

  // A set is judged, and commands are taken, once the library has loaded, as what a set needs
  // depends on its exercise; or once its first try failed, as offline, when they apply as the
  // phone's own screen then does. Until then commands wait on the native side, which keeps them
  // even when the app is ended, and the watch keeps what it showed.
  const ready = session !== null && !(library.isPending && library.failureCount === 0);

  useEffect(() => {
    if (session === null || ready) {
      link.sendState(stateOf(session, exerciseIn(library.data), nextSeq()));
    }
  }, [session, ready, library.data]);

  const receive = useEffectEvent((message: unknown) => {
    const command = parseCommand(message);
    if (!command) {
      console.warn('Dropped a message from the watch that is not a command');
      return;
    }
    const exerciseOf = exerciseIn(library.data);
    updateSession((current) =>
      applyCommand(current, command, { metricsOf: (id) => exerciseOf(id)?.metrics }),
    );
  });

  useEffect(() => (ready ? link.onCommand((message) => receive(message)) : undefined), [ready]);

  return null;
}
