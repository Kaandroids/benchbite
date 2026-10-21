import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

type CenteredContentProps = {
  children: ReactNode;
  /**
   * Feedback under the input, such as a warning or a projected date. It fills the lower half, so
   * the input stays in place however much feedback is shown.
   */
  below?: ReactNode;
};

/**
 * Centres a single large input, such as a wheel or a slider, in the space between the question
 * and the Continue button, so it does not cling to the title with empty space below it.
 */
export function CenteredContent({ children, below }: CenteredContentProps) {
  const { spacing } = useTheme();
  if (below === undefined) {
    return <View style={[styles.centered, { gap: spacing.lg }]}>{children}</View>;
  }
  return (
    <View style={styles.halves}>
      <View style={[styles.upper, { gap: spacing.lg }]}>{children}</View>
      <View style={styles.lower}>
        {/* Out of the layout, so its height never moves the input above. */}
        <View style={[styles.feedback, { gap: spacing.md, paddingTop: spacing.lg }]}>{below}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
  },
  halves: {
    flex: 1,
  },
  upper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  lower: {
    flex: 1,
  },
  feedback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
