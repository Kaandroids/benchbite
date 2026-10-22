import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { clamp } from '@/lib/math';
import { useTheme, type ColorTokens } from '@/theme';

type ProgressBarProps = {
  /** Between 0 and 1. */
  value: number;
  /** The colour of the filled part. */
  color?: keyof ColorTokens;
  accessibilityLabel?: string;
};

export function ProgressBar({ value, color = 'primary', accessibilityLabel }: ProgressBarProps) {
  const { colors, radii } = useTheme();
  const clamped = clamp(value, 0, 1);
  const progress = useSharedValue(clamped);

  useEffect(() => {
    progress.value = withTiming(clamped, { duration: 350 });
  }, [clamped, progress]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View
      // Without it, iOS does not read the bar.
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { backgroundColor: colors.track, borderRadius: radii.full }]}
    >
      <Animated.View
        style={[
          styles.fill,
          { backgroundColor: colors[color], borderRadius: radii.full },
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
