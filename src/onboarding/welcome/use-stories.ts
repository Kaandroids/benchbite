import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

/** How long a slide stays before the next one, while they play on their own. */
export const SLIDE_MS = 4000;

/**
 * The slide shown out of `count`. The slides play through once on their own and stop on the last,
 * so nothing keeps moving. They stay put for reduced motion and screen readers, where moving
 * content gets in the way; stepping is then up to the user.
 */
export function useStories(count: number) {
  const reduceMotion = useReducedMotion();
  const [screenReader, setScreenReader] = useState(false);
  const [index, setIndex] = useState(0);
  const playing = !reduceMotion && !screenReader && index < count - 1;

  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader);
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => subscription.remove();
  }, []);

  // Restarts with every slide, so stepping by hand gives the new slide its full time.
  useEffect(() => {
    if (!playing) {
      return;
    }
    const timeout = setTimeout(() => setIndex((current) => current + 1), SLIDE_MS);
    return () => clearTimeout(timeout);
  }, [playing, index]);

  return {
    index,
    /** Whether the current slide moves on by itself, for its progress bar. */
    playing,
    next: () => setIndex((current) => Math.min(count - 1, current + 1)),
    previous: () => setIndex((current) => Math.max(0, current - 1)),
  };
}
