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
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { BiteAvatar } from './bite-avatar';

const SIZE = 60;
const RING = 3;
/** How far it bobs up, in pixels. */
const BOB = 1.5;

/**
 * Bite in the middle of the tab bar (ADR 0048), bobbing gently unless the user asks for less
 * motion: pressing it opens its chat over the tabs.
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
    bob.set(
      withRepeat(withTiming(-BOB, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true),
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
