import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

/**
 * Centres a single large input, such as a wheel or a slider, in the space between the question
 * and the Continue button, so it does not cling to the title with empty space below it.
 */
export function CenteredContent({ children }: { children: ReactNode }) {
  const { spacing } = useTheme();
  return <View style={[styles.content, { gap: spacing.lg }]}>{children}</View>;
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
  },
});
