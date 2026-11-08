import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { useStoreName } from './use-store-name';

type WatchCardProps = {
  averageBpm: number | null;
  maxBpm: number | null;
  /** The calories, when no other figure on the screen shows them. */
  activeKcal?: number | null;
  source: string | null;
};

/** What the watch measured during a workout (#85): its heart rate, and its calories where asked. */
export function WatchCard({ averageBpm, maxBpm, activeKcal, source }: WatchCardProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const figures = [
    ...(averageBpm !== null && maxBpm !== null
      ? [
          { value: Math.round(averageBpm), label: t('health.watch.averageBpm') },
          { value: Math.round(maxBpm), label: t('health.watch.maxBpm') },
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
      <View style={styles.row}>
        {figures.map((figure, index) => (
          <View
            key={figure.label}
            style={[
              styles.figure,
              { borderLeftWidth: index > 0 ? 1 : 0, borderLeftColor: colors.border },
            ]}
          >
            <Text variant="headline">{figure.value}</Text>
            <Text variant="caption" color="textMuted">
              {figure.label}
            </Text>
          </View>
        ))}
      </View>
      {store ? (
        <Text variant="caption" color="textMuted">
          {source
            ? t('health.watch.through', { source, store })
            : t('health.watch.throughStore', { store })}
        </Text>
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
  figure: {
    flex: 1,
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
});
