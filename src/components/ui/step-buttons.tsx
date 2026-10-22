import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon } from './icon';

/** How faded the minus button is next to plus. */
const QUIET_OPACITY = 0.55;

type StepButtonsProps = {
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseLabel: string;
  increaseLabel: string;
  canDecrease?: boolean;
  canIncrease?: boolean;
  /** The buttons' width and height. */
  size?: number;
};

/**
 * Minus and plus buttons that change a value a step at a time. Minus is quieter than plus, so the
 * two read apart at a glance.
 */
export function StepButtons({
  onDecrease,
  onIncrease,
  decreaseLabel,
  increaseLabel,
  canDecrease = true,
  canIncrease = true,
  size = 48,
}: StepButtonsProps) {
  const { colors, radii, spacing } = useTheme();
  const button = (
    icon: 'minus' | 'plus',
    label: string,
    onPress: () => void,
    enabled: boolean,
    quiet: boolean,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: radii.full,
          backgroundColor: pressed ? colors.selected : colors.iconBackground,
          opacity: !enabled ? 0.3 : quiet && !pressed ? QUIET_OPACITY : 1,
        },
      ]}
    >
      <Icon name={icon} color="primary" />
    </Pressable>
  );
  return (
    <View style={[styles.row, { gap: spacing.sm }]}>
      {button('minus', decreaseLabel, onDecrease, canDecrease, true)}
      {button('plus', increaseLabel, onIncrease, canIncrease, false)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
