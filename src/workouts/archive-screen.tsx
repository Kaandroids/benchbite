import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { allLoaded, LoadState } from '@/components/load-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useUserId } from '@/providers/session-provider';
import { useActiveSession } from '@/sessions/session';

import { WorkoutListItem } from './workout-list-item';
import { useWorkouts } from './workouts';

/**
 * The inactive workouts, kept out of the week until they are switched on again. One archived while
 * it runs shows as running, as in the list of active ones, so that it is not deleted as waiting
 * for premium before it is saved.
 */
export function ArchiveScreen() {
  const { t } = useTranslation();
  const workouts = useWorkouts();
  const session = useActiveSession(useUserId());
  const inactive = workouts.data?.filter((workout) => !workout.active) ?? [];

  return (
    <Screen onBack={() => router.back()} title={t('workout.archive.title')}>
      <Text color="textMuted">{t('workout.archive.body')}</Text>
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
