import type { ComponentProps } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { useTheme } from '@/theme';

type CardProps = Pick<ComponentProps<typeof Animated.View>, 'entering' | 'children'> & {
  /** Changes the padding, the gap or the layout, such as a row or a list without padding. */
  style?: StyleProp<ViewStyle>;
};

/** A bordered surface that groups related content, such as a section of a summary. */
export function Card({ entering, children, style }: CardProps) {
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
});
