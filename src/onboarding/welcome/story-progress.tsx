import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
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
  autoplay: boolean;
  /** Holds the filling segment where it is. */
  paused: boolean;
};

/** One segment per slide: the ones seen are full, the current one fills while it plays. */
export function StoryProgress({ count, index, autoplay, paused }: StoryProgressProps) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.xs }]} accessible={false}>
      {Array.from({ length: count }, (_, segment) => (
        <Segment
          key={segment}
          fill={
            segment < index ? 'full' : segment > index ? 'empty' : autoplay ? 'filling' : 'full'
          }
          paused={paused}
        />
      ))}
    </View>
  );
}

function Segment({ fill, paused }: { fill: 'empty' | 'filling' | 'full'; paused: boolean }) {
  const { colors } = useTheme();
  const width = useSharedValue(fill === 'full' ? 1 : 0);
  const wasFilling = useRef(false);

  useEffect(() => {
    if (fill !== 'filling') {
      wasFilling.current = false;
      width.set(fill === 'full' ? 1 : 0);
      return;
    }
    if (!wasFilling.current) {
      wasFilling.current = true;
      width.set(0);
    }
    if (paused) {
      cancelAnimation(width);
    } else {
      // From where it stands, in the time the slide has left.
      width.set(withTiming(1, { duration: (1 - width.get()) * SLIDE_MS, easing: Easing.linear }));
    }
  }, [fill, paused, width]);

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
