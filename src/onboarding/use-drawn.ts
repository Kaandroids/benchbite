import { useEffect } from 'react';
import { Easing, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

/** How long the onboarding's charts wait before they start drawing. */
const DRAW_DELAY_MS = 200;
/** How long they take to draw. */
const DRAW_MS = 1200;

/**
 * Goes from 0 to 1 after a moment, easing out, for a line, a ring or bars that draw themselves.
 * Every chart of the onboarding uses it, so they all draw at the same pace.
 */
export function useDrawn() {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(
      withDelay(
        DRAW_DELAY_MS,
        withTiming(1, { duration: DRAW_MS, easing: Easing.out(Easing.cubic) }),
      ),
    );
  }, [progress]);
  return progress;
}
