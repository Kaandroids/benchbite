import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { LEDGE_HEIGHT } from '@/theme';

export type RaisedPressableProps = Omit<PressableProps, 'children' | 'style'> & {
  /** Colour of the ledge under the face. Without it the surface is flat. */
  ledgeColor?: string;
  borderRadius: number;
  /** Style of the face that moves down when pressed. */
  faceStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  haptic?: 'impact' | 'selection';
  children: ReactNode;
};

/**
 * A pressable surface that sits on a ledge and moves down onto it when pressed, the chunky style
 * used by buttons and choice cards. Reanimated skips the animation when the system asks to
 * reduce motion.
 */
export function RaisedPressable({
  ledgeColor,
  borderRadius,
  faceStyle,
  style,
  haptic,
  disabled,
  onPressIn,
  onPressOut,
  children,
  ...props
}: RaisedPressableProps) {
  const pressed = useSharedValue(0);
  const ledge = ledgeColor ? LEDGE_HEIGHT : 0;

  const animatedFaceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pressed.value * ledge }],
  }));

  return (
    <Pressable
      {...props}
      disabled={disabled}
      style={style}
      onPressIn={(event) => {
        pressed.value = withTiming(1, { duration: 60 });
        if (haptic === 'impact') {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } else if (haptic === 'selection') {
          void Haptics.selectionAsync();
        }
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressed.value = withTiming(0, { duration: 120 });
        onPressOut?.(event);
      }}
    >
      <View style={{ paddingBottom: ledge }}>
        {ledgeColor ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              { top: ledge, backgroundColor: ledgeColor, borderRadius },
            ]}
          />
        ) : null}
        <Animated.View style={[{ borderRadius }, faceStyle, animatedFaceStyle]}>
          {children}
        </Animated.View>
      </View>
    </Pressable>
  );
}
