import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { BiteAvatar } from './bite-avatar';

const SIZE = 66;
const RING = 3;
/** How far it bounces, in pixels: up from where it sits, and down to the ground it bounces off. */
const BOUNCE = { up: 1.5, down: 5 };
/** How much it squashes as it lands: wider and lower by this share, for this long each way. */
const SQUASH = { share: 0.04, duration: 160 };
const FLIGHT = 1300;

/**
 * Bite in the middle of the tab bar (ADR 0048), bouncing gently as off the ground and squashing a
 * little as it lands, unless the user asks for less motion: pressing it opens its chat over the
 * tabs.
 */
export function BiteButton() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const bob = useSharedValue(0);
  // From 0, round, to 1, squashed on the ground.
  const squash = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(bob);
      cancelAnimation(squash);
      bob.set(0);
      squash.set(0);
      return;
    }
    // Slowing as it rises, speeding up as it falls, squashing as it lands, and off the ground
    // again. Each round starts and ends on the ground, as a repeat goes back to where it started;
    // both rounds take as long, so that they stay together.
    bob.set(BOUNCE.down);
    bob.set(
      withRepeat(
        withSequence(
          withTiming(-BOUNCE.up, { duration: FLIGHT, easing: Easing.out(Easing.quad) }),
          withTiming(BOUNCE.down, { duration: FLIGHT, easing: Easing.in(Easing.quad) }),
          withTiming(BOUNCE.down, { duration: 2 * SQUASH.duration }),
        ),
        -1,
      ),
    );
    squash.set(
      withRepeat(
        withSequence(
          withTiming(0, { duration: 2 * FLIGHT }),
          withTiming(1, { duration: SQUASH.duration, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: SQUASH.duration, easing: Easing.in(Easing.quad) }),
        ),
        -1,
      ),
    );
  }, [reduceMotion, bob, squash]);
  const bobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: bob.get() },
      { scaleX: 1 + SQUASH.share * squash.get() },
      { scaleY: 1 - SQUASH.share * squash.get() },
    ],
  }));

  return (
    // Squashed from its bottom, which stays on the ground.
    <Animated.View style={[styles.bounce, bobStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('tabs.bite')}
        onPress={() => router.push('/bite')}
        style={({ pressed }) => [
          styles.button,
          {
            borderColor: colors.surface,
            shadowColor: colors.primaryButtonLedge,
            transform: [{ translateY: pressed ? 2 : 0 }],
          },
        ]}
      >
        <BiteAvatar size={SIZE - 2 * RING} idle />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bounce: {
    transformOrigin: 'bottom',
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: RING,
    alignItems: 'center',
    justifyContent: 'center',
    // The ledge under it, as under the app's filled buttons.
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
});
