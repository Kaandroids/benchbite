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

const SIZE = 60;
const RING = 3;
/** How far it bounces, in pixels: up from where it sits, and down to the ground it bounces off. */
const BOUNCE = { up: 1.5, down: 3 };

/**
 * Bite in the middle of the tab bar (ADR 0048), bouncing gently as off the ground unless the user
 * asks for less motion: pressing it opens its chat over the tabs.
 */
export function BiteButton() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const bob = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(bob);
      bob.set(0);
      return;
    }
    // Slowing as it rises, speeding up as it falls, and off the ground again at once. Each round
    // starts and ends on the ground, as a repeat goes back to where it started.
    bob.set(BOUNCE.down);
    bob.set(
      withRepeat(
        withSequence(
          withTiming(-BOUNCE.up, { duration: 800, easing: Easing.out(Easing.quad) }),
          withTiming(BOUNCE.down, { duration: 800, easing: Easing.in(Easing.quad) }),
        ),
        -1,
      ),
    );
  }, [reduceMotion, bob]);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.get() }] }));

  return (
    <Animated.View style={bobStyle}>
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
        <BiteAvatar size={SIZE - 2 * RING} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
