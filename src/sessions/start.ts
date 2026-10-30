import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { toIsoDate } from '@/i18n/dates';
import { useUserId } from '@/providers/session-provider';
import type { Workout } from '@/workouts/workouts';

import { fetchBests, fetchLastSets } from './logs';
import { offerRestAlarm } from './rest-alarm';
import { startSession, type ExerciseBests, type LastSets } from './session';
import { useStartMove } from './start-move';

/**
 * Opens the screen of a workout without exercises, which says so and leads to Edit, instead of
 * starting it (ADR 0064). Returns whether it did.
 */
export function openInsteadOfStart(workout: Workout): boolean {
  if (workout.exercises.length > 0) {
    return false;
  }
  router.push({ pathname: '/workout/[id]', params: { id: String(workout.id) } });
  return true;
}

/**
 * Starts a workout, filled in from last time and with each exercise's records, and opens it.
 * Without a connection it starts from the targets instead, and notices no records. A workout not
 * planned today that has a missed or later day this week first asks whether it counts for that
 * day (ADR 0028); `beforeStart` runs once it is sure to start, for example to end the workout it
 * replaces. The first time, it offers to signal the end of rests.
 */
export function useStartWorkout() {
  const { t } = useTranslation();
  const userId = useUserId();
  const queryClient = useQueryClient();
  const askMove = useStartMove();
  return async (workout: Workout, { beforeStart }: { beforeStart?: () => void } = {}) => {
    if (!userId || openInsteadOfStart(workout)) {
      return;
    }
    const choice = await askMove(workout, new Date());
    if (!choice) {
      return;
    }
    beforeStart?.();
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
    const now = Date.now();
    const move = choice.fromOn ? { from: choice.fromOn, to: toIsoDate(new Date(now)) } : undefined;
    startSession(userId, workout, last, { bests, now, move });
    router.push('/session');
    await offerRestAlarm({
      title: t('session.restAlarm.title'),
      message: t('session.restAlarm.message'),
      allow: t('session.restAlarm.allow'),
      notNow: t('session.restAlarm.notNow'),
      channelName: t('session.restOver.channel'),
    }).catch((error: unknown) => console.warn('Could not offer the rest alarm', error));
  };
}
