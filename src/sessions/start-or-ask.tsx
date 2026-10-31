import { router } from 'expo-router';
import { useState } from 'react';

import { afterSheetCloses } from '@/components/ui/sheet';
import { useUserId } from '@/providers/session-provider';
import type { Workout } from '@/workouts/workouts';

import { BusySheet } from './busy-sheet';
import { endSession, useActiveSession } from './session';
import { hasExercises, useStartWorkout } from './start';

/**
 * Starts a workout, or resumes it when it is the one running. While another one runs, it first
 * asks whether to resume that one, finish it and then start, or discard it and start. Returns the
 * function that starts and the sheet that asks, to render with the screen.
 */
export function useStartOrAsk() {
  const session = useActiveSession(useUserId());
  const startWorkout = useStartWorkout();
  const [waiting, setWaiting] = useState<Workout | null>(null);

  const start = (workout: Workout) => {
    if (session?.workoutId === workout.id) {
      router.push('/session');
    } else if (!hasExercises(workout)) {
      // Nothing to start, nor to finish or discard the running one for.
      router.push({ pathname: '/workout/[id]', params: { id: String(workout.id) } });
    } else if (session) {
      setWaiting(workout);
    } else {
      void startWorkout(workout);
    }
  };

  const sheet = session ? (
    <BusySheet
      session={session}
      next={waiting}
      onResume={() => {
        setWaiting(null);
        router.push('/session');
      }}
      onFinish={() => {
        setWaiting(null);
        router.push({ pathname: '/session/finish', params: { next: String(waiting?.id) } });
      }}
      onDiscard={() => {
        const next = waiting;
        setWaiting(null);
        // The running workout ends only once the new one is sure to start, which may ask first.
        if (next) {
          afterSheetCloses(() => void startWorkout(next, { beforeStart: endSession }));
        }
      }}
      onClose={() => setWaiting(null)}
    />
  ) : null;

  return { start, sheet };
}
