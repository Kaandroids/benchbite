import { Pressable, StyleSheet } from 'react-native';

import { useTheme, type ColorTokens } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

type PillButtonProps = {
  label: string;
  onPress: () => void;
  /**
   * `soft` for a light action such as Edit, `primary` for one that saves, `neutral` for one beside
   * another that should stand out more, `danger` for one that deletes, which asks first.
   */
  variant?: 'soft' | 'primary' | 'neutral' | 'danger';
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
  const look = LOOKS[primary && disabled ? 'disabled' : variant];
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
          backgroundColor: colors[look.background],
          opacity: pressed ? 0.6 : 1,
          gap: spacing.xs,
        },
        look.border ? { borderWidth: 1.5, borderColor: colors[look.border] } : null,
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={primary ? 'onPrimary' : 'primary'} /> : null}
      <Text variant="label" color={look.text}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Each variant's colours, and a primary button's while it is disabled. */
const LOOKS: Record<
  NonNullable<PillButtonProps['variant']> | 'disabled',
  { background: keyof ColorTokens; text: keyof ColorTokens; border?: keyof ColorTokens }
> = {
  soft: { background: 'iconBackground', text: 'primaryText' },
  primary: { background: 'primaryButton', text: 'onPrimary' },
  disabled: { background: 'track', text: 'textMuted' },
  neutral: { background: 'track', text: 'text' },
  danger: { background: 'dangerFaintBackground', text: 'danger', border: 'dangerFaintBorder' },
};

const styles = StyleSheet.create({
  pill: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
