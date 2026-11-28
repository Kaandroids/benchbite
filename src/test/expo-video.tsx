// A stand-in for expo-video in tests, which has no native module there: a player that remembers
// what it was told, whose events a test sends through `fakeVideo.emit`, and a view that renders a
// plain View.
import { View } from 'react-native';

type Listener = (payload: Record<string, unknown>) => void;

const listeners = new Map<string, Set<Listener>>();

function createPlayer() {
  return {
    loop: false,
    muted: false,
    playing: false,
    status: 'loading' as string,
    play: jest.fn(function (this: { playing: boolean }) {
      this.playing = true;
    }),
    pause: jest.fn(function (this: { playing: boolean }) {
      this.playing = false;
    }),
    addListener(event: string, listener: Listener) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
      return { remove: () => set.delete(listener) };
    },
  };
}

export const fakeVideo = {
  player: createPlayer(),
  source: undefined as unknown,
  /** Sends an event of the player, as the native player would. */
  emit(event: string, payload: Record<string, unknown>) {
    for (const listener of listeners.get(event) ?? []) {
      listener(payload);
    }
  },
  reset() {
    listeners.clear();
    fakeVideo.player = createPlayer();
    fakeVideo.source = undefined;
  },
};

export function useVideoPlayer(source: unknown, setup?: (player: typeof fakeVideo.player) => void) {
  fakeVideo.source = source;
  setup?.(fakeVideo.player);
  return fakeVideo.player;
}

export function VideoView({ onFirstFrameRender }: { onFirstFrameRender?: () => void }) {
  return <View testID="video-view" onLayout={onFirstFrameRender} />;
}
