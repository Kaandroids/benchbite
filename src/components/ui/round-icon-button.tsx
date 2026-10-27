import { Pressable, StyleSheet } from 'react-native';

import { useTheme, type ColorTokens } from '@/theme';

import { Icon, type IconName } from './icon';

type RoundIconButtonProps = {
  icon: IconName;
  color: keyof ColorTokens;
  background: keyof ColorTokens;
  label: string;
  onPress: () => void;
  /** The width and height; the icon is half of it. */
  size?: number;
  /** Outlines the button, for one that stands on the screen's background. */
  bordered?: boolean;
  disabled?: boolean;
};

/** A round button with an icon, such as the "i" beside an exercise. */
export function RoundIconButton({
  icon,
  color,
  background,
  label,
  onPress,
  size = 32,
  bordered = false,
  disabled = false,
}: RoundIconButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors[background],
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
        },
        bordered ? { borderWidth: 1.5, borderColor: colors.border } : null,
      ]}
    >
      <Icon name={icon} size={size / 2} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
