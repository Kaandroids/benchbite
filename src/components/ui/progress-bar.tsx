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
  /** `thin` for a bar that is one of several, such as a section of a flow. */
  size?: 'regular' | 'thin';
  /** False when an element around it describes the progress, so it is not read twice. */
  accessible?: boolean;
};

export function ProgressBar({
  value,
  color = 'primary',
  accessibilityLabel,
  size = 'regular',
  accessible = true,
}: ProgressBarProps) {
  const { colors, radii } = useTheme();
  const clamped = clamp(value, 0, 1);
  const progress = useSharedValue(clamped);

  useEffect(() => {
    progress.set(withTiming(clamped, { duration: 350 }));
  }, [clamped, progress]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));

  return (
    <View
      // Without it, iOS does not read the bar.
      accessible={accessible}
      accessibilityRole={accessible ? 'progressbar' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={
        accessible ? { min: 0, max: 100, now: Math.round(clamped * 100) } : undefined
      }
      style={[
        styles.track,
        { height: HEIGHTS[size], backgroundColor: colors.track, borderRadius: radii.full },
      ]}
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

const HEIGHTS = { regular: 12, thin: 6 };

const styles = StyleSheet.create({
  track: {
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
