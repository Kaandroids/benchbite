import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

/** A card's summary of its range, on a tint of its own, above the chart it sums up (#335). */
export function SummaryBox({ children }: { children: ReactNode }) {
  const { colors, radii, spacing } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.background,
        borderRadius: radii.md,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      {children}
    </View>
  );
}
