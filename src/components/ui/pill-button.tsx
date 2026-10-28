import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

type PillButtonProps = {
  label: string;
  onPress: () => void;
  /** `soft` for a light action such as Edit, `primary` for one that saves. */
  variant?: 'soft' | 'primary';
  disabled?: boolean;
  /** What screen readers say instead of the label, when the label alone is too short. */
  accessibilityLabel?: string;
  /** Before the label, in the brand colour, such as a target for Goals. */
  icon?: IconName;
};

/** A small rounded button for a screen's top bar, such as Edit or Save. */
export function PillButton({
  label,
  onPress,
  variant = 'soft',
  disabled = false,
  accessibilityLabel,
  icon,
}: PillButtonProps) {
  const { colors, radii, spacing } = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
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
          gap: spacing.xs,
        },
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={primary ? 'onPrimary' : 'primary'} /> : null}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
