import { useScrollToTop } from 'expo-router';
import { useRef } from 'react';
import type { ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** The floating tab bar's sizes (ADR 0048). */
export const TAB_BAR = {
  height: 64,
  /** From the screen's sides, and from its bottom where the system leaves no inset. */
  margin: 14,
  padding: 6,
  /** How far the button in its middle rises out of it. */
  rise: 22,
};

/** How far the bar sits from the screen's bottom. */
export function tabBarBottom(inset: number) {
  return Math.max(inset, TAB_BAR.margin);
}

/** The space the floating tab bar takes at the bottom, which a tab's content scrolls past. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return tabBarBottom(insets.bottom) + TAB_BAR.height;
}

/**
 * A tab's own scroll view: the room it leaves under its content for the bar, and the ref by which
 * pressing its open tab again scrolls it back to the top.
 */
export function useTabScroll() {
  const ref = useRef<ScrollViewInstance>(null);
  useScrollToTop(ref);
  return { ref, barSpace: useTabBarSpace() };
}
