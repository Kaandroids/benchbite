import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme';

type ProgressBarProps = {
  /** Between 0 and 1. */
  value: number;
  accessibilityLabel?: string;
};

export function ProgressBar({ value, accessibilityLabel }: ProgressBarProps) {
  const { colors, radii } = useTheme();
  const clamped = Math.min(1, Math.max(0, value));
  const progress = useSharedValue(clamped);

  useEffect(() => {
    progress.value = withTiming(clamped, { duration: 350 });
  }, [clamped, progress]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { backgroundColor: colors.track, borderRadius: radii.full }]}
    >
      <Animated.View
        style={[
          styles.fill,
          { backgroundColor: colors.primary, borderRadius: radii.full },
          fillStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 12,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
