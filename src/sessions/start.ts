import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { toIsoDate } from '@/i18n/dates';
import { useOpenPremium } from '@/premium/open-premium';
import { useUserId } from '@/providers/session-provider';
import { openOnWatch, startsOnWatch } from '@/watch/start-on-watch';
import { useWorkoutName } from '@/workouts/format';
import { fetchWorkoutHeld, reloadPlan, type Workout } from '@/workouts/workouts';

import { fetchBests, fetchLastSets } from './logs';
import { offerRestAlarm } from './rest-alarm';
import { startSession, type ExerciseBests, type LastSets } from './session';
import { useStartMove } from './start-move';

/**
 * Whether a workout has exercises to start. One without them opens its screen instead, which says
 * so and leads to Edit (ADR 0064).
 */
export function hasExercises(workout: Pick<Workout, 'exercises'>): boolean {
  return workout.exercises.length > 0;
}

/**
 * Starts a workout, filled in from last time and with each exercise's records, and opens it.
 * Without a connection it starts from the targets instead, and notices no records. A workout not
 * planned today that has a missed or later day this week first asks whether it counts for that
 * day (ADR 0028); `beforeStart` runs once it is sure to start, for example to end the workout it
 * replaces. The first time, it offers to signal the end of rests.
 *
 * The cached list can be older than the plan, so whether the workout waits for premium is read
 * again first: one that waits is not started, as its session would not be saved (ADR 0079).
 * Without a connection it starts as the list shows it.
 */
export function useStartWorkout() {
  const { t } = useTranslation();
  const userId = useUserId();
  const queryClient = useQueryClient();
  const askMove = useStartMove();
  const workoutName = useWorkoutName();
  const openPremium = useOpenPremium();
  return async (workout: Workout, { beforeStart }: { beforeStart?: () => void } = {}) => {
    if (!userId) {
      return;
    }
    if (!hasExercises(workout)) {
      router.push({ pathname: '/workout/[id]', params: { id: String(workout.id) } });
      return;
    }
    const held = await fetchWorkoutHeld(workout.id).catch((error: unknown) => {
      console.warn('Could not check whether the workout waits for premium', error);
      return false;
    });
    if (held) {
      void reloadPlan(queryClient);
      Alert.alert(
        t('workout.held.sheetTitle', { name: workoutName(workout) }),
        t('workout.held.kept'),
        [
          { text: t('common.close'), style: 'cancel' },
          { text: t('workout.held.getBack'), onPress: openPremium },
        ],
      );
      return;
    }
    const choice = await askMove(workout, new Date());
    if (!choice) {
      return;
    }
    const onWatch = await startsOnWatch();
    if (onWatch === null) {
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
    const session = startSession(userId, workout, last, {
      bests,
      now,
      move,
      watchFollows: onWatch,
    });
    if (onWatch) {
      // Opens Benchbite on the watch, which then follows the workout without joining it.
      openOnWatch(session);
    }
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
