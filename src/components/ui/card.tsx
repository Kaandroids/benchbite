import type { ComponentProps } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { useTheme, type Theme } from '@/theme';

/** The space between a card's border and its content, unless its style changes it. */
const cardPadding = (spacing: Theme['spacing']) => spacing.lg;

type CardProps = Pick<ComponentProps<typeof Animated.View>, 'entering' | 'children'> & {
  /** A list of rows, which space themselves: no padding above and below, and no gap. */
  list?: boolean;
  /** Changes the padding, the gap or the layout, such as a row. */
  style?: StyleProp<ViewStyle>;
};

/** A bordered surface that groups related content, such as a section of a summary. */
export function Card({ entering, children, list = false, style }: CardProps) {
  const { colors, radii, spacing } = useTheme();
  return (
    <Animated.View
      entering={entering}
      style={[
        styles.card,
        {
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderRadius: radii.lg,
          padding: cardPadding(spacing),
          gap: spacing.md,
        },
        list ? styles.list : null,
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A thin line across the whole width of a card, through its padding, that sets apart two parts of
 * it, such as a header from what it heads. Only for a card that keeps the default padding: one
 * whose style changes it would leave the line short of its border or past it.
 */
export function CardDivider() {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={[
        styles.divider,
        { backgroundColor: colors.border, marginHorizontal: -cardPadding(spacing) },
      ]}
    />
  );
}

/** The thin line above each row of a list card but the first. */
export function listDivider(first: boolean, color: string): ViewStyle {
  return { borderTopWidth: first ? 0 : StyleSheet.hairlineWidth, borderTopColor: color };
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
  list: {
    paddingVertical: 0,
    gap: 0,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
