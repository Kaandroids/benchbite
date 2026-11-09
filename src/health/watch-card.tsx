import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { FigureRow, type Figure } from './figure-row';
import { HeartRateChart } from './heart-rate-chart';
import { SavedToHealthLine } from './saved-to-health';
import { useStoreName } from './use-store-name';
import type { SavedToHealth } from './workout-write';

type WatchCardProps = {
  averageBpm: number | null;
  maxBpm: number | null;
  /** The calories, when no other figure on the screen shows them. */
  activeKcal?: number | null;
  source: string | null;
  /** The heart rate over the workout's time, drawn under the figures when it was kept. */
  chart?: Omit<ComponentProps<typeof HeartRateChart>, 'average' | 'max'> | null;
  /** The calories shown were estimated from the heart rate, as the watch measured none. */
  kcalEstimated?: boolean;
  /** Where the workout is in the store, while workouts are saved to it (ADR 0105). */
  saved?: SavedToHealth | null;
};

/** What the watch measured during a workout (#85): its heart rate, and its calories where asked. */
export function WatchCard({
  averageBpm,
  maxBpm,
  activeKcal,
  source,
  chart,
  kcalEstimated = false,
  saved = null,
}: WatchCardProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const figures: Figure[] = [
    ...(averageBpm !== null && maxBpm !== null
      ? [
          { value: String(Math.round(averageBpm)), label: t('health.watch.averageBpm') },
          { value: String(Math.round(maxBpm)), label: t('health.watch.maxBpm') },
        ]
      : []),
    ...(activeKcal != null
      ? [{ value: format(Math.round(activeKcal)), label: t('health.watch.kcal') }]
      : []),
  ];
  const store = useStoreName();
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={[styles.row, { gap: spacing.md }]}>
        <IconTile name="heart" size={36} color="snack" background="snackBackground" />
        <Text variant="headline">{t('health.watch.title')}</Text>
      </View>
      <FigureRow figures={figures} />
      {chart && averageBpm !== null && maxBpm !== null ? (
        <HeartRateChart {...chart} average={averageBpm} max={maxBpm} />
      ) : null}
      {store || kcalEstimated ? (
        <View style={{ gap: spacing.xs }}>
          {store ? (
            <Text variant="caption" color="textMuted">
              {source
                ? t('health.watch.through', { source, store })
                : t('health.watch.throughStore', { store })}
            </Text>
          ) : null}
          {kcalEstimated ? (
            <Text variant="caption" color="textMuted">
              {t('health.watch.kcalEstimated')}
            </Text>
          ) : null}
        </View>
      ) : null}
      {saved ? (
        <View style={{ paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
          <SavedToHealthLine saved={saved} />
        </View>
      ) : null}
    </Card>
  );
}

/** A finished workout whose watch data has not reached the health store yet. */
export function WaitingCard() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const store = useStoreName();
  if (!store) return null;
  return (
    <Card style={[styles.row, { gap: spacing.md }]}>
      <IconTile name="heart" size={36} color="snack" background="snackBackground" />
      <View style={[styles.flex, { gap: spacing.xs }]}>
        <Text variant="label">{t('health.watch.waitingTitle')}</Text>
        <Text variant="caption" color="textMuted">
          {t('health.watch.waitingBody', { store })}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
});
