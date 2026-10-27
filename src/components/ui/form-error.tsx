import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon } from './icon';
import { Text } from './text';

/**
 * Why a form cannot be saved, or why saving failed: a short message on a red background, under
 * the field it is about or above the button that saves. Screen readers hear it as it shows.
 */
export function FormError({ children }: { children: string }) {
  const { colors, radii, spacing } = useTheme();
  return (
    <View
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
