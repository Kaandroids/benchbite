import { useTranslation } from 'react-i18next';

import { changesWeight } from '@/body/body';
import { allLoaded, LoadState } from '@/components/load-state';
import { TabHeader } from '@/components/tab-header';
import { TabScreen } from '@/components/tab-screen';
import { cardEntering } from '@/components/ui/card';
import { DevButton } from '@/dev/dev-button';
import { useTargetBasis } from '@/nutrition/targets';
import { SettingsButton } from '@/settings/settings-button';
import { WeightCard } from '@/weight/weight-card';
import { useLatestWeight, useWeightUnit } from '@/weight/weights';

/**
 * The progress tab: the weight to log, with its chart and target, and the settings and developer
 * tools at the top.
 */
export function ProgressScreen() {
  const { t } = useTranslation();
  const latestWeight = useLatestWeight();
  const weightUnit = useWeightUnit();
  const basis = useTargetBasis();
  const queries = [latestWeight, weightUnit];
  // The chart shows the target without waiting for it.
  const goal =
    basis.data && changesWeight(basis.data.goal) && basis.data.targetWeightKg !== null
      ? {
          goal: basis.data.goal,
          targetKg: basis.data.targetWeightKg,
          paceKg: basis.data.weeklyPaceKg,
        }
      : null;

  return (
    <TabScreen queries={queries} gap="md">
      <TabHeader title={t('tabs.progress')}>
        <DevButton />
        <SettingsButton />
      </TabHeader>
      {allLoaded(queries) ? (
        <WeightCard
          entering={cardEntering(0)}
          latest={latestWeight.data ?? null}
          unit={weightUnit.data ?? 'kg'}
          today={new Date()}
          goal={goal}
        />
      ) : (
        <LoadState queries={queries} />
      )}
    </TabScreen>
  );
}
