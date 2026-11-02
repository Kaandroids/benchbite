import { StyleSheet, View } from 'react-native';

import type { IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useTheme, type ColorTokens } from '@/theme';

export type UsageStat = {
  icon: IconName;
  count: number;
  /** What was counted, already in the count's plural form. */
  label: string;
  color: keyof ColorTokens;
  background: keyof ColorTokens;
};

/** A row of figures, each upright: an icon tile in its own colour, the count and what it counts. */
export function UsageStats({ stats }: { stats: readonly UsageStat[] }) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.sm }]}>
      {stats.map((stat) => (
        <View key={stat.icon} style={[styles.stat, { gap: spacing.xs }]}>
          <IconTile name={stat.icon} size={44} color={stat.color} background={stat.background} />
          <Text variant="headline">{stat.count}</Text>
          <Text variant="caption" color="textMuted" style={styles.label}>
            {stat.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  label: {
    textAlign: 'center',
  },
});
