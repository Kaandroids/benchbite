import { Pressable, StyleSheet } from 'react-native';

import { useTheme, type ColorTokens } from '@/theme';

import { Icon, type IconName } from './icon';

type RoundIconButtonProps = {
  icon: IconName;
  color: keyof ColorTokens;
  background: keyof ColorTokens;
  label: string;
  onPress: () => void;
};

/** A small round button with an icon, such as the "i" beside an exercise. */
export function RoundIconButton({ icon, color, background, label, onPress }: RoundIconButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors[background], opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name={icon} size={16} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
