import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { allLoaded, LoadState } from '@/components/load-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';

import { WorkoutListItem } from './workout-list-item';
import { useWorkouts } from './workouts';

/** The inactive workouts, kept out of the week until they are switched on again. */
export function ArchiveScreen() {
  const { t } = useTranslation();
  const workouts = useWorkouts();
  const inactive = workouts.data?.filter((workout) => !workout.active) ?? [];

  return (
    <Screen onBack={() => router.back()}>
      <Text variant="title" accessibilityRole="header">
        {t('workout.archive.title')}
      </Text>
      <Text color="textMuted">{t('workout.archive.body')}</Text>
      <LoadState queries={[workouts]} />
      {allLoaded([workouts]) ? (
        inactive.length > 0 ? (
          inactive.map((workout) => <WorkoutListItem key={workout.id} workout={workout} />)
        ) : (
          <Text color="textMuted">{t('workout.archive.empty')}</Text>
        )
      ) : null}
    </Screen>
  );
}
