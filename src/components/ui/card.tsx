import type { ComponentProps } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { useTheme } from '@/theme';

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
          padding: spacing.lg,
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

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
  list: {
    paddingVertical: 0,
    gap: 0,
  },
});
