import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { fonts, type ColorScheme } from '@/theme';
import { darkColors, lightColors } from '@/theme/colors';

import {
  BITE,
  BITE_CIRCLES,
  BRAND_ORANGE,
  CRUMBS,
  HOLE,
  MARK_BOX,
  PLATE,
  RING,
  SPLASH_PLATE_WIDTH,
} from './mark';

const MARK_SIZE = (SPLASH_PLATE_WIDTH / (PLATE.r * 2)) * MARK_BOX;

// Light, the native splash is brand orange; dark, it is the app's own background.
const COLORS: Record<ColorScheme, { background: string; mark: string; word: string }> = {
  light: { background: BRAND_ORANGE, mark: lightColors.onPrimary, word: lightColors.onPrimary },
  dark: { background: darkColors.background, mark: darkColors.primary, word: darkColors.text },
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type AnimatedSplashProps = {
  /** The scheme the native splash screen was drawn in, so the two match. */
  scheme: ColorScheme;
  /** Called once the splash has faded out. */
  onDone: () => void;
};

/**
 * Takes over from the native splash screen, which shows the whole plate: the plate is bitten,
 * the name appears, and the splash fades into the app. Without motion, it only fades.
 */
export function AnimatedSplash({ scheme, onDone }: AnimatedSplashProps) {
  const colors = COLORS[scheme];
  const reduceMotion = useReducedMotion();
  const plateScale = useSharedValue(1);
  const plateTurn = useSharedValue(0);
  const bite = useSharedValue(0);
  const crumbs = useSharedValue(0);
  const word = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const finish = (finished?: boolean) => {
      'worklet';
      if (finished) {
        scheduleOnRN(onDone);
      }
    };
    if (reduceMotion) {
      bite.set(1);
      word.set(1);
      opacity.set(withDelay(900, withTiming(0, { duration: 300 }, finish)));
      return;
    }
    const ease = { easing: Easing.out(Easing.quad) };
    // Draws back, then snaps forward as the bite is taken.
    plateScale.set(
      withDelay(
        200,
        withSequence(
          withTiming(0.93, { duration: 210 }),
          withTiming(1.05, { duration: 180 }),
          withTiming(1, { duration: 240 }),
        ),
      ),
    );
    plateTurn.set(
      withDelay(
        200,
        withSequence(
          withTiming(-4, { duration: 210 }),
          withTiming(3, { duration: 180 }),
          withTiming(0, { duration: 240 }),
        ),
      ),
    );
    bite.set(
      withDelay(
        410,
        withSequence(
          withTiming(1.08, { duration: 130, ...ease }),
          withTiming(1, { duration: 120 }),
        ),
      ),
    );
    crumbs.set(withDelay(420, withTiming(1, { duration: 650, ...ease })));
    word.set(withDelay(700, withTiming(1, { duration: 450, ...ease })));
    // The name stays for about a second, long enough to read.
    opacity.set(withDelay(2100, withTiming(0, { duration: 300 }, finish)));
  }, [reduceMotion, onDone, plateScale, plateTurn, bite, crumbs, word, opacity]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const plateStyle = useAnimatedStyle(() => ({
    transform: [{ scale: plateScale.get() }, { rotate: `${plateTurn.get()}deg` }],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.get(),
    transform: [{ translateY: (1 - word.get()) * 14 }],
  }));

  return (
    <Animated.View
      testID="animated-splash"
      style={[
        StyleSheet.absoluteFill,
        styles.center,
        { backgroundColor: colors.background },
        fadeStyle,
      ]}
    >
      <View style={styles.markBox}>
        <Animated.View style={plateStyle}>
          {/* The background is one colour, so the cuts are drawn in it rather than masked. */}
          <Svg width={MARK_SIZE} height={MARK_SIZE} viewBox={`0 0 ${MARK_BOX} ${MARK_BOX}`}>
            <Circle cx={PLATE.cx} cy={PLATE.cy} r={PLATE.r} fill={colors.mark} />
            <Circle
              cx={PLATE.cx}
              cy={PLATE.cy}
              r={RING.r}
              fill="none"
              stroke={colors.background}
              strokeWidth={RING.width}
            />
            <Circle cx={PLATE.cx} cy={PLATE.cy} r={HOLE.r} fill={colors.background} />
            {BITE_CIRCLES.map((circle) => (
              <BiteCircle
                key={`${circle.cx},${circle.cy}`}
                circle={circle}
                progress={bite}
                color={colors.background}
              />
            ))}
            {CRUMBS.map((crumb) => (
              <Crumb
                key={`${crumb.cx},${crumb.cy}`}
                crumb={crumb}
                progress={crumbs}
                color={colors.mark}
              />
            ))}
          </Svg>
        </Animated.View>
        <Animated.View style={[styles.word, wordStyle]}>
          <Text allowFontScaling={false} style={[styles.wordText, { color: colors.word }]}>
            benchbite
          </Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

type BiteCircleProps = {
  circle: { cx: number; cy: number; r: number };
  progress: SharedValue<number>;
  color: string;
};

/** One circle of the bite, growing out of the bite's centre. */
function BiteCircle({ circle, progress, color }: BiteCircleProps) {
  const animatedProps = useAnimatedProps(() => {
    const size = progress.get();
    return {
      cx: BITE.cx + (circle.cx - BITE.cx) * size,
      cy: BITE.cy + (circle.cy - BITE.cy) * size,
      r: circle.r * size,
    };
  });
  return <AnimatedCircle animatedProps={animatedProps} fill={color} />;
}

type CrumbProps = {
  crumb: (typeof CRUMBS)[number];
  progress: SharedValue<number>;
  color: string;
};

/** A crumb that flies off the bite and fades. */
function Crumb({ crumb, progress, color }: CrumbProps) {
  const animatedProps = useAnimatedProps(() => {
    const flown = progress.get();
    return {
      cx: crumb.cx + crumb.dx * flown,
      cy: crumb.cy + crumb.dy * flown,
      opacity: flown === 0 ? 0 : Math.min(1, (1 - flown) * 2),
    };
  });
  return <AnimatedCircle animatedProps={animatedProps} r={crumb.r} fill={color} />;
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sized like the native splash screen's image, so the plate stays where it was.
  markBox: {
    width: MARK_SIZE,
    height: MARK_SIZE,
  },
  word: {
    position: 'absolute',
    // Below the plate's bottom edge.
    top: (MARK_SIZE * (PLATE.cy + PLATE.r)) / MARK_BOX + 16,
    left: -MARK_SIZE,
    right: -MARK_SIZE,
    alignItems: 'center',
  },
  wordText: {
    fontFamily: fonts.black,
    fontSize: 40,
    letterSpacing: -0.5,
  },
});
