// Keeps the watch on the workout in progress (ADR 0109): every change of the workout is sent to
// it, and its commands are applied to the workout, wherever the app is in it.
import { useEffect, useEffectEvent } from 'react';

import { findExercise, useExerciseLibrary, type LibraryExercise } from '@/exercises/library';
import { useSession, useUserId } from '@/providers/session-provider';
import { updateSession, useActiveSession, useEndedSessions } from '@/sessions/session';
import type { MetricsOf } from '@/sessions/records';
import { useWorkoutName } from '@/workouts/format';

import { link } from './link';
import { keepFinish, useFinishFromWatch } from './finish-from-watch';
import { applyCommand, parseCommand, stateOf, type ExerciseOf } from './protocol';
import { sentToWatch } from './open-on-watch';

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
  // Until sign-in is known, no workout shows, which the watch would take for one let go of.
  const signedIn = useSession().status !== 'loading';
  const session = useActiveSession(useUserId());
  // Loaded only while a workout runs, which is all the watch shows.
  const library = useExerciseLibrary({ enabled: session !== null });
  const ended = useEndedSessions();
  const nameOf = useWorkoutName();
  // As the phone names it: a planned workout without a name of its own by its type.
  const name = session ? nameOf(session) || null : null;
  const exerciseOf = exerciseIn(library.data);
  const metricsOf: MetricsOf = (id) => exerciseOf(id)?.metrics;
  useFinishFromWatch(session, metricsOf);

  // A set is judged, and commands are taken, once the library has loaded, as what a set needs
  // depends on its exercise; or once its first try failed, as offline, when they apply as the
  // phone's own screen then does. Until then commands wait on the native side, which keeps them
  // even when the app is ended, and the watch keeps what it showed.
  const ready = session !== null && !(library.isPending && library.failureCount === 0);

  useEffect(() => {
    if (signedIn && (session === null || ready)) {
      const state = stateOf(
        session,
        { exerciseOf: exerciseIn(library.data), name },
        nextSeq(),
        ended,
      );
      link.sendState(state);
      // A workout started on the watch too opens Benchbite there only now that it is sent.
      sentToWatch(state);
    }
  }, [signedIn, session, ready, library.data, name, ended]);

  const receive = useEffectEvent((message: unknown) => {
    const command = parseCommand(message);
    if (!command) {
      console.warn('Dropped a message from the watch that is not a command');
      return;
    }
    // Kept to be saved at once, which ends the workout, or applied when it cannot be (ADR 0118).
    if (command.type === 'finish') {
      updateSession((current) => keepFinish(current, command));
      return;
    }
    updateSession((current) => applyCommand(current, command, { metricsOf }));
  });

  useEffect(() => (ready ? link.onCommand((message) => receive(message)) : undefined), [ready]);

  return null;
}
