import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Text } from '@/components/ui/text';
import { fonts, useTheme, type ColorTokens } from '@/theme';

type PlanRowProps = {
  icon: IconName;
  /** The colour of the icon, the caption and the round button; the icon sits on `background`. */
  color: keyof ColorTokens;
  background: keyof ColorTokens;
  /** The line above the title, such as the day a workout was missed on. */
  caption: string;
  title: string;
  /** Under the title, such as the workout's size. */
  children: ReactNode;
  /** The round button at the end of the row, filled in `color`. */
  actionIcon: IconName;
  /** What screen readers call the button. */
  actionLabel: string;
  onAction: () => void;
};

/**
 * The layout that the cards of the plan on Today share, such as a missed workout and today's: an
 * icon, the caption, the title and what goes under it, and a round button at the end (#333).
 */
export function PlanRow({
  icon,
  color,
  background,
  caption,
  title,
  children,
  actionIcon,
  actionLabel,
  onAction,
}: PlanRowProps) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.md }]}>
      <IconTile name={icon} color={color} background={background} />
      <View style={styles.text}>
        <Text variant="caption" color={color} style={styles.caption}>
          {caption}
        </Text>
        <Text variant="headline" numberOfLines={1}>
          {title}
        </Text>
        {children}
      </View>
      <RoundIconButton
        icon={actionIcon}
        color="onPrimary"
        background={color}
        size={44}
        label={actionLabel}
        onPress={onAction}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  caption: {
    fontFamily: fonts.bold,
  },
});
