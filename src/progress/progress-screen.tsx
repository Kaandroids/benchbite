import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { TabScreen } from '@/components/tab-screen';
import { cardEntering } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { DevButton } from '@/dev/dev-button';
import { SettingsButton } from '@/settings/settings-button';
import { useTheme } from '@/theme';
import { WeightCard } from '@/weight/weight-card';
import { useLatestWeight, useWeightUnit } from '@/weight/weights';

/** The progress tab: the weight to log, with the settings and developer tools at the top. */
export function ProgressScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const latestWeight = useLatestWeight();
  const weightUnit = useWeightUnit();
  const queries = [latestWeight, weightUnit];

  return (
    <TabScreen queries={queries} gap="md">
      <View style={[styles.header, { gap: spacing.sm, marginBottom: spacing.xs }]}>
        <Text variant="title" accessibilityRole="header" style={styles.title}>
          {t('tabs.progress')}
        </Text>
        <DevButton />
        <SettingsButton />
      </View>
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

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flex: 1,
  },
});
