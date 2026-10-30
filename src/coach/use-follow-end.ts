import { useRef } from 'react';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewInstance,
} from 'react-native';

/** How close to the end counts as reading the end. */
const END_SLACK = 40;

/**
 * Keeps a chat at its end while the user reads there, so that it follows what comes; scrolled up,
 * they stay where they read. `animated` while nothing is being written, which would jump.
 */
export function useFollowEnd(animated: boolean) {
  const ref = useRef<ScrollViewInstance>(null);
  const atEnd = useRef(true);
  const height = useRef(0);
  const toEnd = () => ref.current?.scrollToEnd({ animated });

  return {
    /** For the ScrollView. */
    scrollProps: {
      ref,
      scrollEventThrottle: 100,
      onScroll: ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset, layoutMeasurement, contentSize } = nativeEvent;
        atEnd.current =
          contentOffset.y + layoutMeasurement.height >= contentSize.height - END_SLACK;
      },
      onContentSizeChange: () => atEnd.current && toEnd(),
      onLayout: ({ nativeEvent }: LayoutChangeEvent) => {
        // The keyboard opening shrinks the chat: the end stays in sight.
        if (nativeEvent.layout.height < height.current && atEnd.current) toEnd();
        height.current = nativeEvent.layout.height;
      },
    },
    /** Wraps what the user asks with, after which the chat follows it down. */
    following:
      <A extends unknown[]>(ask: (...args: A) => void) =>
      (...args: A) => {
        atEnd.current = true;
        ask(...args);
      },
  };
}
