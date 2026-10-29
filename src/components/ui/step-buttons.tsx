import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon } from './icon';

/** How faded the minus button is next to plus. */
const QUIET_OPACITY = 0.55;
/** The size of each half of the joined buttons, wide enough to tap with a thumb. */
const JOINED_WIDTH = 52;
const JOINED_HEIGHT = 44;

type StepButtonsProps = {
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseLabel: string;
  increaseLabel: string;
  canDecrease?: boolean;
  canIncrease?: boolean;
  /** The buttons' width and height. */
  size?: number;
  /** `joined` puts both in one outlined pill, quieter beside a large value. */
  variant?: 'separate' | 'joined';
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
  variant = 'separate',
}: StepButtonsProps) {
  const { colors, radii, spacing } = useTheme();
  if (variant === 'joined') {
    const half = (icon: 'minus' | 'plus', label: string, onPress: () => void, enabled: boolean) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !enabled }}
        disabled={!enabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          {
            width: JOINED_WIDTH,
            height: '100%',
            backgroundColor: pressed ? colors.selected : undefined,
            opacity: enabled ? 1 : 0.3,
          },
        ]}
      >
        <Icon name={icon} size={20} color="primaryText" />
      </Pressable>
    );
    return (
      <View
        style={[
          styles.row,
          styles.joined,
          {
            height: JOINED_HEIGHT,
            borderRadius: radii.full,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      >
        {half('minus', decreaseLabel, onDecrease, canDecrease)}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        {half('plus', increaseLabel, onIncrease, canIncrease)}
      </View>
    );
  }
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
  joined: {
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  divider: {
    width: 1.5,
    height: 22,
  },
});
