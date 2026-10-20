import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useTheme } from '@/theme';

import { Text } from './text';

const ITEM_HEIGHT = 48;
/** Rows shown at once. Odd, so that one row sits in the middle. */
const VISIBLE_ITEMS = 5;
const PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2);
/**
 * Rows rendered on each side of the selected one. Lists such as weights in pounds have hundreds
 * of values, and only the rows near the middle can be seen.
 */
const RENDERED_ROWS = 10;

type WheelPickerProps = {
  values: readonly number[];
  value: number;
  onChange: (value: number) => void;
  /** Text shown for a value. Defaults to the number itself. */
  format?: (value: number) => string;
  /** What screen readers announce for the value, for example "72 kilograms". */
  formatAccessibilityValue?: (value: number) => string;
  accessibilityLabel: string;
  width?: number;
};

/**
 * A scrolling wheel of values with the selected one in the middle, like the iOS time picker.
 * Scrolling snaps to each row; `onChange` fires as soon as a new row reaches the middle.
 *
 * It is a plain ScrollView rather than a FlatList, because the wheel usually sits inside a
 * scrolling screen, where React Native does not allow a virtualized list. It renders only the
 * rows around the value instead, so `value` must follow `onChange`.
 */
export function WheelPicker({
  values,
  value,
  onChange,
  format = String,
  formatAccessibilityValue = format,
  accessibilityLabel,
  width = 96,
}: WheelPickerProps) {
  const { colors, radii } = useTheme();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const selectedIndex = Math.max(0, values.indexOf(value));
  const scrollY = useSharedValue(selectedIndex * ITEM_HEIGHT);
  // The row in the middle while scrolling, to fire `onChange` only when it changes.
  const centerIndex = useSharedValue(selectedIndex);

  const selectIndex = (index: number) => {
    const next = values[index];
    if (next !== undefined) {
      void Haptics.selectionAsync();
      onChange(next);
    }
  };

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.set(event.contentOffset.y);
      const index = Math.min(
        values.length - 1,
        Math.max(0, Math.round(event.contentOffset.y / ITEM_HEIGHT)),
      );
      if (index !== centerIndex.get()) {
        centerIndex.set(index);
        scheduleOnRN(selectIndex, index);
      }
    },
  });

  // Follows the value when it changes from outside, for example from a screen reader. The jump
  // is not animated, so that the rows passed on the way do not fire `onChange`.
  useEffect(() => {
    if (centerIndex.get() !== selectedIndex) {
      centerIndex.set(selectedIndex);
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
    }
  }, [selectedIndex, centerIndex, scrollRef]);

  const firstRendered = Math.max(0, selectedIndex - RENDERED_ROWS);

  const step = (delta: number) => {
    const next = values[selectedIndex + delta];
    if (next !== undefined) {
      onChange(next);
    }
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: formatAccessibilityValue(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => step(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={{ width, height: ITEM_HEIGHT * VISIBLE_ITEMS }}
    >
      <View
        pointerEvents="none"
        style={[
          styles.selection,
          { top: PADDING, backgroundColor: colors.track, borderRadius: radii.md },
        ]}
      />
      <Animated.ScrollView
        ref={scrollRef}
        contentOffset={{ x: 0, y: selectedIndex * ITEM_HEIGHT }}
        contentContainerStyle={{ height: values.length * ITEM_HEIGHT + PADDING * 2 }}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {values.slice(firstRendered, selectedIndex + RENDERED_ROWS + 1).map((item, offset) => (
          <WheelItem
            key={item}
            label={format(item)}
            index={firstRendered + offset}
            scrollY={scrollY}
          />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

type WheelItemProps = {
  label: string;
  index: number;
  scrollY: SharedValue<number>;
};

function WheelItem({ label, index, scrollY }: WheelItemProps) {
  // Rows shrink and fade with their distance from the middle, measured in rows.
  const animatedStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollY.get() / ITEM_HEIGHT - index);
    return {
      opacity: interpolate(distance, [0, 1, 2], [1, 0.45, 0.2], 'clamp'),
      transform: [{ scale: interpolate(distance, [0, 1, 2], [1, 0.86, 0.74], 'clamp') }],
    };
  });

  return (
    <Animated.View style={[styles.item, { top: PADDING + index * ITEM_HEIGHT }, animatedStyle]}>
      <Text variant="title" numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  selection: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
  },
  item: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
