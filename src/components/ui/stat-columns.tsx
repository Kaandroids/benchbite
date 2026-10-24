import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Card } from './card';
import { Text } from './text';

export type Stat = { value: string | number; label: string };

type StatColumnsProps = {
  stats: Stat[];
  /** A row under the figures, such as when a workout started and ended. */
  footer?: ReactNode;
};

/** Figures in even columns on one card, each over its label, with an optional row under them. */
export function StatColumns({ stats, footer }: StatColumnsProps) {
  const { colors, spacing } = useTheme();
  return (
    <Card style={styles.card}>
      <View style={[styles.row, { paddingVertical: spacing.md }]}>
        {stats.map((stat, index) => (
          <View
            key={stat.label}
            style={[
              styles.stat,
              { borderLeftWidth: index > 0 ? 1 : 0, borderLeftColor: colors.border },
            ]}
          >
            <Text variant="headline" style={styles.tabular}>
              {stat.value}
            </Text>
            <Text variant="caption" color="textMuted">
              {stat.label}
            </Text>
          </View>
        ))}
      </View>
      {footer ? (
        <View
          style={{
            paddingVertical: spacing.sm,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          {footer}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 0,
    gap: 0,
  },
  row: {
    flexDirection: 'row',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
