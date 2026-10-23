import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import { useSession } from '@/providers/session-provider';
import type { Workout } from '@/workouts/workouts';

import { fetchLastSets } from './logs';
import { startSession, type LastSets } from './session';

/** The signed-in user's id, once there is a session. */
export function useUserId(): string | undefined {
  const state = useSession();
  return state.status === 'ready' ? state.session.user.id : undefined;
}

/**
 * Starts a workout, filled in from last time, and opens it. Without a connection it starts from
 * the targets instead.
 */
export function useStartWorkout() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return async (workout: Workout) => {
    if (!userId) {
      return;
    }
    const ids = [...workout.exercises, ...(workout.finisher ? [workout.finisher] : [])].map(
      (exercise) => exercise.exerciseId,
    );
    let last: LastSets = {};
    try {
      last = await queryClient.fetchQuery({
        queryKey: ['last-sets', ...ids],
        queryFn: () => fetchLastSets(ids),
        staleTime: 0,
      });
    } catch (error) {
      console.warn('Could not load the last sets', error);
    }
    startSession(userId, workout, last);
    router.push('/session');
  };
}
