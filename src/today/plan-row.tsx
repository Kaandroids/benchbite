import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { fonts, useTheme, type ColorTokens } from '@/theme';

type PlanRowProps = {
  icon: IconName;
  /** The icon's and the caption's colour, on `background` behind the icon, apart from orange. */
  color: keyof ColorTokens;
  background: keyof ColorTokens;
  /** The line above the title, such as the day a workout was missed on. */
  caption: string;
  title: string;
  /** Under the title, such as the workout's size. */
  children: ReactNode;
  /** At the end of the row, such as a round button in `color`. */
  action: ReactNode;
};

/**
 * The layout that the cards of the plan on Today share, such as a missed workout and today's: an
 * icon, the caption, the title and what goes under it, and an action at the end (#333).
 */
export function PlanRow({
  icon,
  color,
  background,
  caption,
  title,
  children,
  action,
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
      {action}
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
