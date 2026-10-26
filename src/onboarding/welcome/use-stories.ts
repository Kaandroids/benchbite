import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** How long a slide stays before the next one, while they play on their own. */
export const SLIDE_MS = 4000;

/**
 * Follows an accessibility setting as it changes, which Reanimated's own reduced-motion value
 * does not: it is read once, at launch.
 */
function useAccessibilitySetting(
  read: () => Promise<boolean>,
  event: 'reduceMotionChanged' | 'screenReaderChanged',
) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    void read().then(setEnabled);
    const subscription = AccessibilityInfo.addEventListener(event, setEnabled);
    return () => subscription.remove();
  }, [read, event]);
  return enabled;
}

/**
 * The slide shown out of `count`. The slides play on their own and start again after the last;
 * holding them pauses, as with stories. They stay put for reduced motion and screen readers, where
 * moving content gets in the way; stepping is then up to the user. They also wait while another
 * step is open on top of the welcome, which stays mounted underneath.
 */
export function useStories(count: number) {
  const reduceMotion = useAccessibilitySetting(
    AccessibilityInfo.isReduceMotionEnabled,
    'reduceMotionChanged',
  );
  const screenReader = useAccessibilitySetting(
    AccessibilityInfo.isScreenReaderEnabled,
    'screenReaderChanged',
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Which way the last step went, for the slide to come in from that side.
  const [direction, setDirection] = useState<'on' | 'back'>('on');
  const [focused, setFocused] = useState(true);
  const autoplay = !reduceMotion && !screenReader;
  const playing = autoplay && !paused && focused;
  // The time the current slide has left, kept across a pause.
  const remaining = useRef(SLIDE_MS);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const next = useCallback(() => {
    setDirection('on');
    setIndex((current) => (current + 1) % count);
  }, [count]);

  // A new slide gets its full time, as does one that starts playing on its own again, so it keeps
  // in step with its progress bar, which then starts over. React runs the timer's cleanup below
  // before this.
  useEffect(() => {
    remaining.current = SLIDE_MS;
  }, [index, autoplay]);

  useEffect(() => {
    if (!playing) {
      return;
    }
    const startedAt = Date.now();
    const timeout = setTimeout(next, remaining.current);
    return () => {
      clearTimeout(timeout);
      remaining.current -= Date.now() - startedAt;
    };
  }, [playing, index, next]);

  return {
    index,
    /** Whether the slides move on by themselves, for the progress bar. */
    autoplay,
    paused: paused || !focused,
    direction,
    next,
    previous: () => {
      setDirection('back');
      setIndex((current) => Math.max(0, current - 1));
    },
    pause: () => setPaused(true),
    resume: () => setPaused(false),
  };
}
