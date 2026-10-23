import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import { useSession } from '@/providers/session-provider';
import type { Workout } from '@/workouts/workouts';

import { fetchBests, fetchLastSets } from './logs';
import { startSession, type ExerciseBests, type LastSets } from './session';

/** The signed-in user's id, once there is a session. */
export function useUserId(): string | undefined {
  const state = useSession();
  return state.status === 'ready' ? state.session.user.id : undefined;
}

/**
 * Starts a workout, filled in from last time and with each exercise's records, and opens it.
 * Without a connection it starts from the targets instead, and notices no records.
 */
export function useStartWorkout() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return async (workout: Workout) => {
    if (!userId) {
      return;
    }
    const ids = workout.exercises.map((exercise) => exercise.exerciseId);
    const [last, bests] = await Promise.all([
      queryClient
        .fetchQuery({
          queryKey: ['last-sets', ...ids],
          queryFn: () => fetchLastSets(ids),
          staleTime: 0,
        })
        .catch((error: unknown): LastSets => {
          console.warn('Could not load the last sets', error);
          return {};
        }),
      queryClient
        .fetchQuery({
          queryKey: ['bests', ...ids],
          queryFn: () => fetchBests(ids),
          staleTime: 0,
        })
        .catch((error: unknown): ExerciseBests => {
          console.warn('Could not load the records', error);
          return {};
        }),
    ]);
    startSession(userId, workout, last, bests);
    router.push('/session');
  };
}
