import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { BRAND_ORANGE } from '@/brand/mark';

/** A lighter orange for every other star, so that they do not all look alike. */
const LIGHT_ORANGE = '#FFB27F';

/** A four-pointed star in a 24 × 24 box. */
const STAR = 'M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z';

/**
 * Where the stars sit around what they surround, as fractions of the box from its top left, and
 * their size as a fraction of its width: two on the left, two on the right, apart in height.
 */
const STARS = [
  { x: 0.02, y: 0.24, size: 0.14, color: BRAND_ORANGE, delay: 0 },
  { x: 0.82, y: 0.02, size: 0.1, color: BRAND_ORANGE, delay: 120 },
  { x: 0.88, y: 0.42, size: 0.12, color: LIGHT_ORANGE, delay: 240 },
  { x: 0.2, y: 0.0, size: 0.08, color: LIGHT_ORANGE, delay: 80 },
] as const;

/** How long a star takes to flash, and how long all of them wait before the next flash. */
const FLASH = 900;
const PAUSE = 1800;

type SparklesProps = {
  /** What the stars surround, such as Bite, in the middle of the box. */
  children: ReactNode;
  /** The box's width and height; the stars reach to its edges. */
  size: number;
};

/**
 * Stars that flash around something now and then, for a moment worth celebrating, such as Bite
 * on the premium screen. With less motion they stay still.
 */
export function Sparkles({ children, size }: SparklesProps) {
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {children}
      {STARS.map((star, index) => (
        <Star key={index} {...star} box={size} />
      ))}
    </View>
  );
}

type StarProps = (typeof STARS)[number] & { box: number };

function Star({ x, y, size, color, delay, box }: StarProps) {
  const reduceMotion = useReducedMotion();
  // From 0, hidden, through 1, at its brightest, to 2, gone again.
  const flash = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    cancelAnimation(flash);
    if (reduceMotion) {
      flash.set(1);
      return;
    }
    flash.set(0);
    flash.set(
      withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1, { duration: FLASH * 0.4, easing: Easing.out(Easing.back(2)) }),
            withTiming(2, { duration: FLASH * 0.6, easing: Easing.in(Easing.quad) }),
            withTiming(0, { duration: 0 }),
            withTiming(0, { duration: PAUSE }),
          ),
          -1,
        ),
      ),
    );
    return () => cancelAnimation(flash);
  }, [reduceMotion, delay, flash]);

  const flashStyle = useFlashStyle(flash);
  const width = box * size;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.star, { left: box * x, top: box * y, width, height: width }, flashStyle]}
    >
      <Svg width={width} height={width} viewBox="0 0 24 24" accessible={false}>
        <Path d={STAR} fill={color} />
      </Svg>
    </Animated.View>
  );
}

/** A star's look along its flash: it grows and turns as it lights up, then fades and shrinks. */
function useFlashStyle(flash: SharedValue<number>) {
  return useAnimatedStyle(() => {
    const value = flash.get();
    const rising = value <= 1;
    return {
      opacity: rising ? value : 2 - value,
      transform: [
        { scale: rising ? 0.2 + 0.95 * value : 1.15 - 0.45 * (value - 1) },
        { rotate: `${value * 22}deg` },
      ],
    };
  });
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  star: {
    position: 'absolute',
  },
});
