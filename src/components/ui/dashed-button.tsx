import { Pressable, StyleSheet } from 'react-native';

import { useTheme, type ColorTokens } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

const TONES: Record<
  'primary' | 'muted' | 'danger',
  { text: keyof ColorTokens; border: keyof ColorTokens; background: keyof ColorTokens }
> = {
  primary: { text: 'primaryText', border: 'planned', background: 'selected' },
  muted: { text: 'textMuted', border: 'placeholder', background: 'surface' },
  danger: { text: 'danger', border: 'dangerFaintBorder', background: 'dangerFaintBackground' },
};

type DashedButtonProps = {
  icon: IconName;
  label: string;
  tone: keyof typeof TONES;
  onPress: () => void;
};

/** A row with a dashed border, for adding what is not there yet or an action set apart. */
export function DashedButton({ icon, label, tone, onPress }: DashedButtonProps) {
  const { colors, radii, spacing } = useTheme();
  const { text, border, background } = TONES[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.button,
        {
          gap: spacing.sm,
          borderRadius: radii.md,
          borderColor: colors[border],
          backgroundColor: colors[background],
        },
      ]}
    >
      <Icon name={icon} size={18} color={text} />
      <Text variant="label" color={text}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
});
