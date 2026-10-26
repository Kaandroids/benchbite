import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

const PIECES = 28;
const DURATION_MS = 2600;

/** The pieces, worked out once: from the left and right edges, flying in and falling. */
const CONFETTI = Array.from({ length: PIECES }, (_, index) => {
  const fromLeft = index % 2 === 0;
  return {
    fromLeft,
    top: 60 + ((index * 37) % 260),
    dx: (fromLeft ? 1 : -1) * (120 + ((index * 53) % 160)),
    dy: 180 + ((index * 71) % 300),
    delay: (index % 7) * 60,
    color: index % 4,
  };
});

/**
 * A burst of confetti from both sides of the screen, once, after `delay`, to celebrate. It lies over the
 * content without catching touches, and is left out when the system asks to reduce motion.
 */
export function Confetti({ delay = 0 }: { delay?: number }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  // The brand orange and a few festive colours that read on both themes.
  const palette = [colors.primary, colors.warning, colors.success, colors.info];
  if (reduceMotion) {
    return null;
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {CONFETTI.map((piece, index) => (
        <Piece key={index} {...piece} delay={delay + piece.delay} color={palette[piece.color]!} />
      ))}
    </View>
  );
}

type PieceProps = Omit<(typeof CONFETTI)[number], 'color'> & { color: string };

function Piece({ fromLeft, top, dx, dy, delay, color }: PieceProps) {
  const flown = useSharedValue(0);
  useEffect(() => {
    flown.set(
      withDelay(
        delay,
        withTiming(1, { duration: DURATION_MS, easing: Easing.bezier(0.2, 0.7, 0.4, 1) }),
      ),
    );
  }, [flown, delay]);
  const style = useAnimatedStyle(() => ({
    // Hidden at the edge until it flies.
    opacity: flown.get() === 0 ? 0 : 1 - flown.get(),
    transform: [
      { translateX: dx * flown.get() },
      { translateY: dy * flown.get() },
      { rotate: `${540 * flown.get()}deg` },
    ],
  }));
  return (
    <Animated.View
      style={[
        styles.piece,
        { top, backgroundColor: color },
        fromLeft ? styles.left : styles.right,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    width: 9,
    height: 14,
    borderRadius: 2,
  },
  left: {
    left: -6,
  },
  right: {
    right: -6,
  },
});
