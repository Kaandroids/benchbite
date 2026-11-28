import { useFocusEffect } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { act, fireEvent, render, screen } from '@/test/render';
import { fakeVideo } from '@/test/expo-video';

import { ExerciseVideo } from './exercise-video';

jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated'),
  useReducedMotion: jest.fn(() => false),
}));

const VIDEO = { video: 'https://media.test/squat.mp4', poster: 'https://media.test/squat.jpg' };

/** The screen's focus: in front until `blur()` is called. */
let blur = () => {};

beforeEach(() => {
  fakeVideo.reset();
  jest.mocked(useReducedMotion).mockReturnValue(false);
  jest.mocked(useFocusEffect).mockImplementation((effect) =>
    useEffect(() => {
      const cleanup = effect();
      blur = () => cleanup?.();
      return cleanup;
    }, [effect]),
  );
});

it('plays the video muted and looping, from the cache, while the screen is in front', async () => {
  await render(<ExerciseVideo video={VIDEO} onError={jest.fn()} />);
  expect(fakeVideo.source).toEqual({ uri: VIDEO.video, useCaching: true });
  expect(fakeVideo.player.loop).toBe(true);
  expect(fakeVideo.player.muted).toBe(true);
  expect(fakeVideo.player.play).toHaveBeenCalled();
  await act(() => blur());
  expect(fakeVideo.player.pause).toHaveBeenCalled();
});

it('shows the poster and a spinner until the first frame', async () => {
  await render(<ExerciseVideo video={VIDEO} onError={jest.fn()} />);
  expect(screen.getByTestId('video-poster')).toHaveProp('source', { uri: VIDEO.poster });
  await fireEvent(screen.getByTestId('video-view'), 'layout');
  expect(screen.queryByTestId('video-poster')).toBeNull();
});

it('pauses and plays on a tap, also while it loads', async () => {
  await render(<ExerciseVideo video={VIDEO} onError={jest.fn()} />);
  // Not playing yet: the player is still loading, and the tap still means pause.
  await fireEvent.press(screen.getByLabelText('How the exercise goes'));
  expect(fakeVideo.player.pause).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('How the exercise goes')).toHaveProp(
    'accessibilityHint',
    'Plays the video',
  );
  await fireEvent.press(screen.getByLabelText('How the exercise goes'));
  expect(fakeVideo.player.play).toHaveBeenCalledTimes(2);
});

it('waits for a tap with Reduce Motion on', async () => {
  jest.mocked(useReducedMotion).mockReturnValue(true);
  await render(<ExerciseVideo video={VIDEO} onError={jest.fn()} />);
  expect(fakeVideo.player.play).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('How the exercise goes'));
  expect(fakeVideo.player.play).toHaveBeenCalledTimes(1);
});

it('tells the screen when the video cannot play', async () => {
  const onError = jest.fn();
  await render(<ExerciseVideo video={VIDEO} onError={onError} />);
  await act(() => fakeVideo.emit('statusChange', { status: 'error' }));
  expect(onError).toHaveBeenCalled();
});

it('plays on when the app comes back to the screen, unless it was paused by a tap', async () => {
  const listeners: ((state: string) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.push(listener as (state: string) => void);
    return { remove: jest.fn() } as never;
  });
  await render(<ExerciseVideo video={VIDEO} onError={jest.fn()} />);
  expect(fakeVideo.player.play).toHaveBeenCalledTimes(1);
  await act(() => listeners.forEach((listener) => listener('active')));
  expect(fakeVideo.player.play).toHaveBeenCalledTimes(2);

  await fireEvent.press(screen.getByLabelText('How the exercise goes'));
  await act(() => listeners.forEach((listener) => listener('active')));
  expect(fakeVideo.player.play).toHaveBeenCalledTimes(2);
});
