import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { clamp } from '@/lib/math';
import { useTheme } from '@/theme';

import { Text } from './text';

const THUMB_SIZE = 28;
const TRACK_HEIGHT = 10;
/** Room above and below the track, so the thumb is easy to grab. */
const TOUCH_HEIGHT = 44;

type SliderProps = {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  accessibilityLabel: string;
  /** What screen readers announce for the value, for example "0.5 kilograms a week". */
  formatAccessibilityValue?: (value: number) => string;
  /** Labels under both ends of the track, for example "Gentle" and "Fast". */
  minLabel?: string;
  maxLabel?: string;
};

/**
 * Picks a value from a range in fixed steps. The thumb follows the finger and settles on the
 * nearest step when released; tapping the track jumps there.
 */
export function Slider({
  value,
  onChange,
  min,
  max,
  step,
  accessibilityLabel,
  formatAccessibilityValue = String,
  minLabel,
  maxLabel,
}: SliderProps) {
  const { colors, radii, spacing } = useTheme();
  const [width, setWidth] = useState(0);
  // How far the thumb can travel.
  const range = Math.max(0, width - THUMB_SIZE);
  const offset = useSharedValue(0);
  const pressed = useSharedValue(0);
  const dragging = useSharedValue(false);
  // The value under the thumb while dragging, to fire `onChange` only when it changes.
  const current = useSharedValue(value);

  // Follows the value when it is not being dragged, for example after a screen reader change.
  useEffect(() => {
    current.set(value);
    if (!dragging.get()) {
      offset.set(withTiming(((value - min) / (max - min)) * range, { duration: 150 }));
    }
  }, [value, min, max, range, current, dragging, offset]);

  const emit = (next: number) => {
    void Haptics.selectionAsync();
    onChange(next);
  };

  const moveTo = (x: number) => {
    'worklet';
    const clamped = Math.min(range, Math.max(0, x - THUMB_SIZE / 2));
    offset.set(clamped);
    const steps = Math.round(((clamped / range) * (max - min)) / step);
    // Rounding keeps steps like 0.1 from turning into 0.30000000000000004.
    const next = Math.round((min + steps * step) * 1e6) / 1e6;
    if (next !== current.get()) {
      current.set(next);
      scheduleOnRN(emit, next);
    }
  };

  const settle = () => {
    'worklet';
    offset.set(withTiming(((current.get() - min) / (max - min)) * range, { duration: 120 }));
  };

  const pan = usePanGesture({
    // Horizontal movement only, so that the screen can still scroll vertically over the slider.
    activeOffsetX: [-6, 6],
    failOffsetY: [-12, 12],
    onActivate: (event) => {
      'worklet';
      dragging.set(true);
      pressed.set(withTiming(1, { duration: 80 }));
      moveTo(event.x);
    },
    onUpdate: (event) => {
      'worklet';
      moveTo(event.x);
    },
    onFinalize: () => {
      'worklet';
      dragging.set(false);
      pressed.set(withTiming(0, { duration: 120 }));
      settle();
    },
  });

  const tap = useTapGesture({
    onActivate: (event) => {
      'worklet';
      moveTo(event.x);
      settle();
    },
  });

  const gesture = useCompetingGestures(pan, tap);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.get() }, { scale: 1 + pressed.get() * 0.15 }],
  }));
  // The fill ends under the middle of the thumb; the track starts inset by its margin.
  const fillStyle = useAnimatedStyle(() => ({ width: offset.get() + TRACK_HEIGHT / 2 }));

  const stepBy = (delta: number) => {
    const next = Math.round(clamp(value + delta * step, min, max) * 1e6) / 1e6;
    if (next !== value) {
      onChange(next);
    }
  };

  return (
    <View style={{ gap: spacing.xs }}>
      <GestureDetector gesture={gesture}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabel}
          accessibilityValue={{ min, max, now: value, text: formatAccessibilityValue(value) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) =>
            stepBy(event.nativeEvent.actionName === 'increment' ? 1 : -1)
          }
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          style={styles.touchArea}
        >
          <View style={[styles.track, { backgroundColor: colors.track, borderRadius: radii.full }]}>
            <Animated.View
              style={[
                styles.fill,
                { backgroundColor: colors.primary, borderRadius: radii.full },
                fillStyle,
              ]}
            />
          </View>
          {width > 0 ? (
            <Animated.View
              style={[
                styles.thumb,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.primary,
                  borderRadius: radii.full,
                },
                thumbStyle,
              ]}
            />
          ) : null}
        </View>
      </GestureDetector>
      {minLabel || maxLabel ? (
        <View style={styles.labels}>
          <Text variant="caption" color="textMuted">
            {minLabel}
          </Text>
          <Text variant="caption" color="textMuted">
            {maxLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    height: TOUCH_HEIGHT,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_HEIGHT,
    marginHorizontal: THUMB_SIZE / 2 - TRACK_HEIGHT / 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
  thumb: {
    position: 'absolute',
    left: 0,
    top: (TOUCH_HEIGHT - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderWidth: 4,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
