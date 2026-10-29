import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { weightGoal } from '@/body/body';
import { allLoaded, LoadState } from '@/components/load-state';
import { TabHeader } from '@/components/tab-header';
import { TabScreen } from '@/components/tab-screen';
import { cardEntering } from '@/components/ui/card';
import { DevButton } from '@/dev/dev-button';
import { RECORDS_KEY, TRAINING_DAYS_KEY } from '@/history/history';
import { NUTRITION_DAYS_KEY } from '@/nutrition/day-nutrition';
import { useTargetBasis } from '@/nutrition/targets';
import { SettingsButton } from '@/settings/settings-button';
import { WeightCard } from '@/weight/weight-card';
import { useLatestWeight, useWeightUnit, WEIGHTS_KEY } from '@/weight/weights';

import { NutritionCard } from './nutrition-card';
import { RecordsButton } from './records-button';
import { StreakButton } from './streak-button';
import { TrainingCard } from './training-card';

/**
 * The progress tab (ADR 0047): the weight to log, with its chart and target, what was eaten and
 * how training went over a range, the records beaten and the streak, with the settings and
 * developer tools at the top.
 */
export function ProgressScreen() {
  const { t } = useTranslation();
  const latestWeight = useLatestWeight();
  const weightUnit = useWeightUnit();
  const basis = useTargetBasis();
  const today = new Date();
  const queryClient = useQueryClient();
  const queries = [latestWeight, weightUnit];
  // Pulling down loads again what the cards load themselves too: the weights, meals, workouts and records.
  const refreshed = [
    ...queries,
    {
      refetch: () =>
        Promise.all(
          [WEIGHTS_KEY, NUTRITION_DAYS_KEY, TRAINING_DAYS_KEY, RECORDS_KEY].map((queryKey) =>
            queryClient.refetchQueries({ queryKey, type: 'active' }),
          ),
        ),
    },
  ];
  // The chart shows the target without waiting for it.
  const goal = basis.data
    ? weightGoal({
        goal: basis.data.goal,
        targetWeightKg: basis.data.targetWeightKg ?? undefined,
        weeklyPaceKg: basis.data.weeklyPaceKg ?? undefined,
      })
    : null;

  return (
    <TabScreen queries={refreshed} gap="md">
      <TabHeader title={t('tabs.progress')}>
        <DevButton />
        <SettingsButton />
      </TabHeader>
      {allLoaded(queries) ? (
        <>
          <WeightCard
            entering={cardEntering(0)}
            latest={latestWeight.data ?? null}
            unit={weightUnit.data ?? 'kg'}
            today={today}
            goal={goal}
          />
          <NutritionCard entering={cardEntering(1)} today={today} />
          <TrainingCard entering={cardEntering(2)} today={today} />
          <RecordsButton entering={cardEntering(3)} today={today} />
          <StreakButton entering={cardEntering(4)} today={today} />
        </>
      ) : (
        <LoadState queries={queries} />
      )}
    </TabScreen>
  );
}
