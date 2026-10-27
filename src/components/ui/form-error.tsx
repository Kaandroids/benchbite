import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon } from './icon';
import { Text } from './text';

type FormErrorProps = {
  children: string;
  /** A button under the message that helps, such as logging in instead. */
  action?: ReactNode;
};

/**
 * Why a form cannot be saved, or why saving failed: a short message on a red background, under
 * the field it is about or above the button that saves. Screen readers hear it as it shows.
 */
export function FormError({ children, action }: FormErrorProps) {
  const { colors, radii, spacing } = useTheme();
  const message = (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.error,
        {
          gap: spacing.sm,
          padding: spacing.md,
          borderRadius: radii.md,
          backgroundColor: colors.dangerBackground,
        },
      ]}
    >
      <Icon name="error" size={16} color="danger" />
      <Text variant="caption" style={styles.text}>
        {children}
      </Text>
    </View>
  );
  if (!action) {
    return message;
  }
  return (
    <View style={{ gap: spacing.xs }}>
      {message}
      {/* Outside the alert, which a screen reader reads as one, so that it can be reached. */}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  text: {
    flex: 1,
  },
});
