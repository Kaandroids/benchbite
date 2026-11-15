import { type RefObject, useCallback, useEffect, useRef } from 'react';
import {
  Keyboard,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  TextInput,
} from 'react-native';

/** Where a field is in the scrolled content, and the part of the content on screen. */
type Span = { top: number; bottom: number };
type Viewport = { offset: number; height: number };

/**
 * The offset that shows the whole field with this margin around it, or null when it is already
 * shown. A field taller than the viewport shows its top.
 */
export function offsetToReveal(field: Span, viewport: Viewport, margin: number): number | null {
  const top = Math.max(0, field.top - margin);
  const bottom = field.bottom + margin;
  if (top < viewport.offset || bottom - top > viewport.height) {
    return top;
  }
  if (bottom > viewport.offset + viewport.height) {
    return bottom - viewport.height;
  }
  return null;
}

/**
 * Keeps the focused text field of a scroll view wholly on screen, with a margin around it. iOS
 * scrolls a field into view as it gets focus, but before the keyboard has made the scroll view
 * smaller, so a field near the bottom stayed under the buttons below it. This scrolls again
 * whenever the scroll view changes height and whenever the keyboard shows, which iOS also tells
 * when the focus moves from one field to another.
 */
export function useFocusedFieldInView(
  scroll: RefObject<ScrollViewInstance | null>,
  margin: number,
) {
  const viewport = useRef<Viewport>({ offset: 0, height: 0 });

  const reveal = useCallback(() => {
    const field = TextInput.State.currentlyFocusedInput();
    const content = scroll.current?.getInnerViewRef();
    if (!field || !content) {
      return;
    }
    field.measureLayout(
      content,
      (_x, y, _width, height) => {
        const to = offsetToReveal({ top: y, bottom: y + height }, viewport.current, margin);
        if (to !== null) {
          scroll.current?.scrollTo({ y: to, animated: true });
        }
      },
      // A field outside this scroll view, such as one in a sheet over it, is not its to show.
      () => undefined,
    );
  }, [scroll, margin]);

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', reveal);
    return () => subscription.remove();
  }, [reveal]);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewport.current.height = event.nativeEvent.layout.height;
      reveal();
    },
    [reveal],
  );
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    viewport.current.offset = event.nativeEvent.contentOffset.y;
  }, []);

  return { onLayout, onScroll, scrollEventThrottle: 16 };
}
