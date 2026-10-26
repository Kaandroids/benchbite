import { act } from '@testing-library/react-native';

import { render, screen } from '@/test/render';

import { AnimatedSplash } from './animated-splash';

let mockReduceMotion = false;
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual<object>('react-native-reanimated'),
  useReducedMotion: () => mockReduceMotion,
}));

describe('AnimatedSplash', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    mockReduceMotion = false;
  });

  it('shows the name and ends after the bite', async () => {
    const onDone = jest.fn();
    await render(<AnimatedSplash scheme="light" onDone={onDone} />);
    expect(screen.getByText('benchbite')).toBeTruthy();

    await act(() => jest.advanceTimersByTime(2000));
    expect(onDone).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTime(1000));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('ends sooner when the phone reduces motion', async () => {
    mockReduceMotion = true;
    const onDone = jest.fn();
    await render(<AnimatedSplash scheme="dark" onDone={onDone} />);

    // The finished mark and the name stay long enough to read before the fade.
    await act(() => jest.advanceTimersByTime(800));
    expect(onDone).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTime(700));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
