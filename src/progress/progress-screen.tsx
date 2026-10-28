import { useTranslation } from 'react-i18next';

import { allLoaded, LoadState } from '@/components/load-state';
import { TabHeader } from '@/components/tab-header';
import { TabScreen } from '@/components/tab-screen';
import { cardEntering } from '@/components/ui/card';
import { DevButton } from '@/dev/dev-button';
import { SettingsButton } from '@/settings/settings-button';
import { WeightCard } from '@/weight/weight-card';
import { useLatestWeight, useWeightUnit } from '@/weight/weights';

/** The progress tab: the weight to log, with the settings and developer tools at the top. */
export function ProgressScreen() {
  const { t } = useTranslation();
  const latestWeight = useLatestWeight();
  const weightUnit = useWeightUnit();
  const queries = [latestWeight, weightUnit];

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
        />
      ) : (
        <LoadState queries={queries} />
      )}
    </TabScreen>
  );
}
