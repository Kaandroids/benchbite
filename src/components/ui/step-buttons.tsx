import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon } from './icon';

/** The size of each half of the joined buttons, wide enough to tap with a thumb. */
const JOINED_WIDTH = 52;
const JOINED_HEIGHT = 44;

type StepButtonProps = {
  icon: 'minus' | 'plus';
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** The width and height. */
  size?: number;
};

/**
 * One round minus or plus button, grey so that orange stays with the filled buttons, the minus
 * quieter than the plus: for a value between the two, or beside it in StepButtons.
 */
export function StepButton({ icon, label, onPress, disabled = false, size = 48 }: StepButtonProps) {
  const { colors, radii } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: radii.full,
          backgroundColor: pressed ? colors.border : colors.track,
          opacity: disabled ? 0.3 : 1,
        },
      ]}
    >
      {/* The usual icon on a thumb-sized button, half of a smaller one. */}
      <Icon
        name={icon}
        size={size >= 44 ? 24 : size / 2}
        color={icon === 'minus' ? 'textMuted' : 'text'}
      />
    </Pressable>
  );
}

type StepButtonsProps = {
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseLabel: string;
  increaseLabel: string;
  canDecrease?: boolean;
  canIncrease?: boolean;
  /** The buttons' width and height, when separate. */
  size?: number;
  /** `joined` puts both in one outlined pill, quieter beside a large value. */
  variant?: 'separate' | 'joined';
};

/**
 * Minus and plus buttons that change a value a step at a time, in greys so that orange stays with
 * the filled buttons. Minus is quieter than plus, so the two read apart at a glance.
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
  const joined = variant === 'joined';
  const button = (icon: 'minus' | 'plus', label: string, onPress: () => void, enabled: boolean) =>
    joined ? (
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
            backgroundColor: pressed ? colors.track : undefined,
            opacity: enabled ? 1 : 0.3,
          },
        ]}
      >
        <Icon name={icon} size={20} color={icon === 'minus' ? 'textMuted' : 'text'} />
      </Pressable>
    ) : (
      <StepButton icon={icon} label={label} onPress={onPress} disabled={!enabled} size={size} />
    );
  const minus = button('minus', decreaseLabel, onDecrease, canDecrease);
  const plus = button('plus', increaseLabel, onIncrease, canIncrease);
  if (joined) {
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
        {minus}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        {plus}
      </View>
    );
  }
  return (
    <View style={[styles.row, { gap: spacing.sm }]}>
      {minus}
      {plus}
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
