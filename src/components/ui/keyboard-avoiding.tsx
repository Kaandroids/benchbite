import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  type KeyboardEvent,
  LayoutAnimation,
  Platform,
  StyleSheet,
  View,
  type ViewInstance,
  type ViewStyle,
} from 'react-native';

type KeyboardAvoidingProps = {
  children: ReactNode;
  /** Defaults to filling the space it is given. */
  style?: ViewStyle;
};

/** Where a view is in the window. */
type Frame = { y: number; height: number };

/**
 * How much of a view the keyboard covers, measured from the top of the keyboard, both in the
 * window's coordinates. iOS reports the top as 0 when Prefer Cross-Fade Transitions is on, which
 * says nothing about where the keyboard is.
 */
export function keyboardOverlap(frame: Frame, keyboardTop: number): number {
  if (keyboardTop <= 0) {
    return 0;
  }
  return Math.max(0, Math.round(frame.y + frame.height - keyboardTop));
}

/**
 * Keeps fields and the buttons below them above the keyboard, with padding as tall as the part of
 * the view the keyboard covers. It measures the view in the window when the keyboard opens, so it
 * works wherever the view is, also under a top bar; React Native's KeyboardAvoidingView measures
 * it against its parent instead. Android draws edge to edge, so its window no longer shrinks for
 * the keyboard and needs the padding as much as iOS; where a window still shrinks, nothing is
 * covered and the padding stays 0.
 */
export function KeyboardAvoiding({ children, style = styles.flex }: KeyboardAvoidingProps) {
  const view = useRef<ViewInstance>(null);
  const [bottom, setBottom] = useState(0);
  // The padding set last, read by the keyboard's listeners, which are added once.
  const current = useRef(0);

  useEffect(() => {
    const move = (to: number, event: KeyboardEvent) => {
      if (current.current === to) {
        return;
      }
      current.current = to;
      animateWith(event);
      setBottom(to);
    };
    const lift = (event: KeyboardEvent) => {
      view.current?.measureInWindow((_x, y, _width, height) =>
        move(keyboardOverlap({ y, height }, event.endCoordinates.screenY), event),
      );
    };
    const drop = (event: KeyboardEvent) => move(0, event);
    // iOS tells before the keyboard moves, so the padding moves with it; Android only after.
    const ios = Platform.OS === 'ios';
    const subscriptions = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', lift),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', drop),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

  return (
    <View ref={view} style={[style, { paddingBottom: bottom }]}>
      {children}
    </View>
  );
}

/** Moves the padding as the keyboard moves, as React Native's KeyboardAvoidingView does. */
function animateWith({ duration, easing }: KeyboardEvent) {
  if (!duration || !easing) {
    return;
  }
  const length = Math.max(duration, 10);
  LayoutAnimation.configureNext({
    duration: length,
    update: { duration: length, type: LayoutAnimation.Types[easing] ?? 'keyboard' },
  });
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
