// Keeps the watch on the workout in progress (ADR 0109): every change of the workout is sent to
// it, and its commands are applied to the workout, wherever the app is in it.
import { useEffect, useEffectEvent, useRef } from 'react';

import { findExercise, useExerciseLibrary } from '@/exercises/library';
import { useUserId } from '@/providers/session-provider';
import { updateSession, useActiveSession } from '@/sessions/session';

import { link } from './link';
import { applyCommand, parseCommand, stateOf, type WatchCommand } from './protocol';

let lastSeq = 0;

/** A number above the last one, from the clock so that it keeps growing after the app restarts. */
function nextSeq(): number {
  lastSeq = Math.max(Date.now(), lastSeq + 1);
  return lastSeq;
}

/** Sends the workout to the watch and applies what the watch sends. */
export function WatchSync() {
  const session = useActiveSession(useUserId());
  // Loaded only while a workout runs, which is all the watch shows.
  const library = useExerciseLibrary({ enabled: session !== null });

  useEffect(() => {
    const name = (id: string) => findExercise(library.data, id)?.name ?? '';
    link.sendState(stateOf(session, name, nextSeq()));
  }, [session, library.data]);

  // Commands wait while the library loads, as what a set needs depends on its exercise. Once its
  // first try fails, as offline, they apply as the phone's own screen then does.
  const waiting = useRef<WatchCommand[]>([]);
  const loading = library.isPending && library.failureCount === 0;
  // Those that waited first, in the order they came.
  const apply = useEffectEvent((commands: WatchCommand[]) => {
    const all = [...waiting.current, ...commands];
    waiting.current = [];
    const metricsOf = (id: string) => findExercise(library.data, id)?.metrics;
    updateSession((current) =>
      all.reduce((next, command) => applyCommand(next, command, { metricsOf }), current),
    );
  });
  const receive = useEffectEvent((message: unknown) => {
    const command = parseCommand(message);
    if (!command) {
      console.warn('Dropped a message from the watch that is not a command');
    } else if (session && loading) {
      // Without a workout, there is nothing to wait for: the command changes nothing.
      waiting.current.push(command);
    } else {
      apply([command]);
    }
  });

  useEffect(() => link.onCommand((message) => receive(message)), []);

  useEffect(() => {
    if (!loading && waiting.current.length > 0) {
      apply([]);
    }
  }, [loading]);

  return null;
}
