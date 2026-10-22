import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { useTheme } from '@/theme';

type CardProps = Pick<ComponentProps<typeof Animated.View>, 'entering' | 'children'>;

/** A bordered surface that groups related content, such as a section of a summary. */
export function Card({ entering, children }: CardProps) {
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
