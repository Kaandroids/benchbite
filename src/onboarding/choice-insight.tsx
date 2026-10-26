import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Caption } from '@/components/ui/caption';
import { Card } from '@/components/ui/card';
import type { IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

type ChoiceInsightProps = {
  title: string;
  /** The current choice; its content fades in anew when it changes. */
  choice: string | undefined;
  /** What to show before there is a choice; nothing by default. */
  empty?: ReactNode;
  children: ReactNode;
};

/**
 * The card under a step's choices on what the chosen answer means for the plan, as on the goal
 * step. It changes with the choice and is read out when it does.
 */
export function ChoiceInsight({ title, choice, empty, children }: ChoiceInsightProps) {
  const { spacing } = useTheme();
  if (!choice && !empty) {
    return null;
  }
  return (
    <Card style={{ gap: spacing.md, marginTop: spacing.xs }}>
      <Caption>{title}</Caption>
      {choice ? (
        <Animated.View
          key={choice}
          entering={FadeIn.duration(250)}
          accessibilityLiveRegion="polite"
          style={{ gap: spacing.md }}
        >
          {children}
        </Animated.View>
      ) : (
        empty
      )}
    </Card>
  );
}

/** One thing a choice means, with its icon, a label and its value. */
export function InsightRow({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value: string;
}) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.md }]}>
      <IconTile name={icon} size={36} />
      <View style={styles.flex}>
        <Text variant="caption" color="textMuted">
          {label}
        </Text>
        <Text variant="bodyStrong">{value}</Text>
      </View>
    </View>
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
