import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon } from './icon';
import { Text } from './text';

/**
 * A message in a tinted box: a warning before an action, or an error that is not about one
 * field.
 */
export function Note({ tone, children }: { tone: 'warning' | 'danger'; children: string }) {
  const { colors, radii, spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={[
        styles.note,
        {
          backgroundColor: tone === 'warning' ? colors.warningBackground : colors.dangerBackground,
          borderRadius: radii.md,
          padding: spacing.md,
          gap: spacing.sm,
        },
      ]}
    >
      <Icon name={tone === 'warning' ? 'warning' : 'error'} size={20} color={tone} />
      <Text variant="bodyStrong" style={styles.flex}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  flex: {
    flex: 1,
  },
});
