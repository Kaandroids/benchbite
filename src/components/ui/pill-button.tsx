import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './text';

type PillButtonProps = {
  label: string;
  onPress: () => void;
  /** `soft` for a light action such as Edit, `primary` for one that saves. */
  variant?: 'soft' | 'primary';
  disabled?: boolean;
};

/** A small rounded button for a screen's top bar, such as Edit or Save. */
export function PillButton({
  label,
  onPress,
  variant = 'soft',
  disabled = false,
}: PillButtonProps) {
  const { colors, radii, spacing } = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          borderRadius: radii.full,
          paddingHorizontal: primary ? spacing.lg : spacing.md,
          backgroundColor: primary
            ? disabled
              ? colors.track
              : colors.primaryButton
            : colors.iconBackground,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <Text
        variant="label"
        color={primary ? (disabled ? 'textMuted' : 'onPrimary') : 'primaryText'}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 40,
    justifyContent: 'center',
  },
});
