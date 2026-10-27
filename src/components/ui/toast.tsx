import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { Text } from './text';

/** How long a toast stays before it hides by itself. */
export const TOAST_MS = 5000;

type ToastProps = {
  message: string;
  /** A button beside the message, such as Undo. */
  action?: { label: string; onPress: () => void };
  /** Called when the toast should go, after `TOAST_MS` or once its action is pressed. */
  onHide: () => void;
};

/**
 * A short message at the bottom of the screen after something happened, such as an entry removed,
 * with an action to take it back. Screen readers hear the message as it shows.
 */
export function Toast({ message, action, onHide }: ToastProps) {
  const { colors, radii, spacing } = useTheme();

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
    const timer = setTimeout(onHide, TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, onHide]);

  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(150)}
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        {
          gap: spacing.md,
          borderRadius: radii.lg,
          backgroundColor: colors.inverseSurface,
          paddingLeft: spacing.lg,
          paddingRight: spacing.sm,
          paddingVertical: spacing.sm,
        },
      ]}
    >
      <View style={styles.message}>
        <Text variant="bodyStrong" color="onInverse" numberOfLines={2}>
          {message}
        </Text>
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            action.onPress();
            onHide();
          }}
          hitSlop={4}
          style={({ pressed }) => [
            styles.action,
            { borderRadius: radii.full, paddingHorizontal: spacing.md, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text variant="label" color="onInverse">
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  message: {
    flex: 1,
  },
  action: {
    minHeight: 44,
    justifyContent: 'center',
  },
});
