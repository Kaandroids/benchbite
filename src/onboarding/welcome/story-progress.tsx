import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { SLIDE_MS } from './use-stories';

type StoryProgressProps = {
  count: number;
  index: number;
  /** Fills the current segment over a slide's time; otherwise it is full at once. */
  playing: boolean;
};

/** One segment per slide: the ones seen are full, the current one fills while it plays. */
export function StoryProgress({ count, index, playing }: StoryProgressProps) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.xs }]} accessible={false}>
      {Array.from({ length: count }, (_, segment) => (
        <Segment
          key={segment}
          fill={segment < index ? 'full' : segment > index ? 'empty' : playing ? 'filling' : 'full'}
        />
      ))}
    </View>
  );
}

function Segment({ fill }: { fill: 'empty' | 'filling' | 'full' }) {
  const { colors } = useTheme();
  const width = useSharedValue(fill === 'full' ? 1 : 0);

  useEffect(() => {
    if (fill === 'filling') {
      width.set(0);
      width.set(withTiming(1, { duration: SLIDE_MS, easing: Easing.linear }));
    } else {
      width.set(fill === 'full' ? 1 : 0);
    }
  }, [fill, width]);

  const style = useAnimatedStyle(() => ({ width: `${width.get() * 100}%` }));
  return (
    <View style={[styles.segment, { backgroundColor: colors.track }]}>
      <Animated.View style={[styles.fill, { backgroundColor: colors.primary }, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    borderRadius: 2,
  },
});
