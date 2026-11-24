import { fakeAudio } from '@/test/expo-audio';
import { renderHook } from '@/test/render';

import { useVoicePlayback } from './use-voice-playback';

beforeEach(() => {
  jest.clearAllMocks();
  fakeAudio.reset();
});

it('pauses what plays as the user records, and says so', async () => {
  fakeAudio.player.playing = true;
  const { result } = await renderHook(() => useVoicePlayback());

  expect(result.current.pause()).toBe(true);
  expect(fakeAudio.player.pause).toHaveBeenCalledTimes(1);
});

it('leaves a player with nothing playing alone, which would let go of the audio (#720)', async () => {
  const { result } = await renderHook(() => useVoicePlayback());

  expect(result.current.pause()).toBe(false);
  expect(fakeAudio.player.pause).not.toHaveBeenCalled();
});
