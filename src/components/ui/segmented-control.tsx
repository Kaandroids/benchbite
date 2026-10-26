import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { Text } from './text';

const INSET = 4;

type SegmentedControlProps<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

/**
 * A compact row of options with one selected, for settings that change how a screen works, such
 * as the unit of a value, or a short answer whose result shows below it, such as a workout length.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const { colors, radii } = useTheme();
  const [segmentWidth, setSegmentWidth] = useState(0);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const position = useSharedValue(selectedIndex);

  useEffect(() => {
    position.value = withTiming(selectedIndex, { duration: 180 });
  }, [selectedIndex, position]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value * segmentWidth }],
  }));

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      onLayout={(event) =>
        setSegmentWidth((event.nativeEvent.layout.width - INSET * 2) / options.length)
      }
      style={[styles.track, { backgroundColor: colors.track, borderRadius: radii.md }]}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          style={[
            styles.pill,
            {
              width: segmentWidth,
              backgroundColor: colors.elevated,
              borderColor: colors.border,
              borderRadius: radii.md - INSET,
            },
            pillStyle,
          ]}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => {
              if (!selected) {
                void Haptics.selectionAsync();
                onChange(option.value);
              }
            }}
            style={styles.segment}
          >
            <Text variant="bodyStrong" color={selected ? 'text' : 'textMuted'} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: INSET,
  },
  pill: {
    position: 'absolute',
    top: INSET,
    bottom: INSET,
    left: INSET,
    borderWidth: 1,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
