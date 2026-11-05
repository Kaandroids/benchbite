import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { allLoaded, LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useOpenPremium } from '@/premium/open-premium';
import { useUserId } from '@/providers/session-provider';
import { useActiveSession } from '@/sessions/session';

import { WorkoutListItem } from './workout-list-item';
import { useCurrentWorkoutLimits, useWorkouts } from './workouts';

/**
 * The inactive workouts, kept out of the week until they are switched on again. One archived while
 * it runs shows as running, as in the list of active ones, so that it is not deleted as waiting
 * for premium before it is saved. On a plan without the archive they can only be looked at, with a
 * way to premium (ADR 0082).
 */
export function ArchiveScreen() {
  const { t } = useTranslation();
  const workouts = useWorkouts();
  const session = useActiveSession(useUserId());
  const openPremium = useOpenPremium();
  const inactive = workouts.data?.filter((workout) => !workout.active) ?? [];
  // As the plan is now, as it may have just put what is here on hold.
  const locked = useCurrentWorkoutLimits()?.archive === false;

  return (
    <Screen
      onBack={() => router.back()}
      title={t('workout.archive.title')}
      footer={
        locked && inactive.length > 0 ? (
          <Button label={t('workout.limitSheet.seePremium')} onPress={openPremium} />
        ) : undefined
      }
    >
      <Text color="textMuted">
        {t(locked ? 'workout.archive.bodyFree' : 'workout.archive.body')}
      </Text>
      <LoadState queries={[workouts]} />
      {allLoaded([workouts]) ? (
        inactive.length > 0 ? (
          inactive.map((workout) => (
            <WorkoutListItem
              key={workout.id}
              workout={workout}
              running={session?.workoutId === workout.id}
            />
          ))
        ) : (
          <Text color="textMuted">{t('workout.archive.empty')}</Text>
        )
      ) : null}
    </Screen>
  );
}
