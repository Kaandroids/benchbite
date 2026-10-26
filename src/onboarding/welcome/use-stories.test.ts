import { AccessibilityInfo } from 'react-native';

import { act, renderHook } from '@/test/render';

import { SLIDE_MS, useStories } from './use-stories';

// Focus is switched by hand: the cleanup of the last focus effect is the blur.
let mockBlur: (() => void) | undefined;
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => (() => void) | undefined) =>
    jest.requireActual<typeof import('react')>('react').useEffect(() => {
      mockBlur = effect() ?? undefined;
      return mockBlur;
    }, [effect]),
}));

describe('useStories', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('keeps the time a slide has left while it is held', async () => {
    const { result } = await renderHook(() => useStories(4));
    await act(() => jest.advanceTimersByTime(SLIDE_MS / 2));
    await act(() => result.current.pause());
    await act(() => jest.advanceTimersByTime(SLIDE_MS * 3));
    expect(result.current.index).toBe(0);

    await act(() => result.current.resume());
    await act(() => jest.advanceTimersByTime(SLIDE_MS / 2 - 1));
    expect(result.current.index).toBe(0);
    await act(() => jest.advanceTimersByTime(1));
    expect(result.current.index).toBe(1);
  });

  it('waits while another screen covers it', async () => {
    const { result } = await renderHook(() => useStories(4));
    await act(() => mockBlur?.());
    await act(() => jest.advanceTimersByTime(SLIDE_MS * 3));
    expect(result.current.index).toBe(0);
    expect(result.current.paused).toBe(true);
  });

  it('stays put while reduced motion is on', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { result } = await renderHook(() => useStories(4));
    await act(() => jest.advanceTimersByTime(SLIDE_MS * 3));
    expect(result.current.autoplay).toBe(false);
    expect(result.current.index).toBe(0);
  });
});
