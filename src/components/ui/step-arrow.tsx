import { Pressable, StyleSheet } from 'react-native';

import { Icon } from './icon';

type StepArrowProps = {
  direction: 'back' | 'forward';
  label: string;
  /** Without it the arrow is dimmed and does nothing. */
  onPress?: () => void;
};

/**
 * An arrow to the day or week before or after, alone, without a filled circle, so that what it
 * stands beside stands out more than the way to another.
 */
export function StepArrow({ direction, label, onPress }: StepArrowProps) {
  const enabled = onPress !== undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.step, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Icon name={direction} size={22} color={enabled ? 'primary' : 'placeholder'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  step: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
