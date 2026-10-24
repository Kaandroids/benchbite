import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './text';

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
};

/**
 * A rounded choice among several, such as a filter. A selected chip is tinted with an orange
 * border, like a selected card.
 */
export function Chip({ label, selected, onPress, disabled = false }: ChipProps) {
  const { colors, radii } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderRadius: radii.full,
          borderColor: selected ? colors.primaryButton : colors.border,
          backgroundColor: selected ? colors.selected : colors.surface,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <Text variant="captionStrong" color={selected ? 'primaryText' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 40,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderWidth: 1.5,
  },
});
