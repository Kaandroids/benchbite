import { toBase64 } from '@shared/base64_bytes';
import { setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';

import { fakeAudio } from '@/test/expo-audio';
import { act, renderHook } from '@/test/render';

import { m4a } from '../../supabase/functions/coach-chat/test-voice';

import { discardVoices, readVoice } from './chat-voice';
import { useVoiceRecorder, type VoiceEnd } from './use-voice-recorder';

jest.mock('expo-haptics', () => ({
  ...jest.requireActual<typeof import('expo-haptics')>('expo-haptics'),
  impactAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('./chat-voice', () => ({
  ...jest.requireActual('./chat-voice'),
  readVoice: jest.fn(() => Promise.resolve('dm9pY2U=')),
  discardVoices: jest.fn(),
  listRecording: jest.fn(),
}));

/** A promise the test resolves when it wants. */
function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function recorder() {
  const ends: VoiceEnd[] = [];
  const hook = await renderHook(() => useVoiceRecorder((end) => ends.push(end)));
  return { ...hook, ends };
}

beforeEach(() => {
  jest.clearAllMocks();
  fakeAudio.reset();
});

it('ends a hold let go before recording started once, as a tap', async () => {
  const prepared = deferred();
  fakeAudio.recorder.prepareToRecordAsync.mockReturnValueOnce(prepared.promise);
  const { result, ends } = await recorder();

  await act(async () => result.current.start());
  // Let go, and the recording ended twice over, as a release and a cancel.
  const released = result.current.finish(true);
  const cancelled = result.current.finish(false);
  await act(async () => {
    prepared.resolve();
    await Promise.all([released, cancelled]);
  });

  expect(fakeAudio.recorder.stop).toHaveBeenCalledTimes(1);
  expect(ends).toEqual([{ tooShort: true }]);
  // Let go already, it never showed that it started.
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
  expect(result.current.recording).toBe(false);
});

it('sends the length the file gives, as coach-chat keeps it', async () => {
  jest.mocked(readVoice).mockResolvedValueOnce(toBase64(m4a(4550)));
  fakeAudio.recorderState = { ...fakeAudio.recorderState, durationMillis: 4450 };
  const { result, ends } = await recorder();

  await act(async () => result.current.start());
  await act(async () => result.current.finish(true));

  expect(ends).toEqual([{ sent: expect.objectContaining({ durationMs: 4550 }) as unknown }]);
});

it('sends nothing that ends after the screen went', async () => {
  let read: (data: string) => void = () => {};
  jest.mocked(readVoice).mockReturnValueOnce(new Promise((resolve) => (read = resolve)));
  fakeAudio.recorderState = { ...fakeAudio.recorderState, durationMillis: 4200 };
  const { result, ends, unmount } = await recorder();

  await act(async () => result.current.start());
  let ending: Promise<void> = Promise.resolve();
  await act(async () => {
    ending = result.current.finish(true);
  });
  await act(async () => unmount());
  await act(async () => {
    read('dm9pY2U=');
    await ending;
  });

  expect(ends).toEqual([]);
  expect(discardVoices).toHaveBeenCalledWith(['file:///cache/voice.m4a']);
});

it('starts no other recording while the last one is still ending', async () => {
  const stopped = deferred();
  fakeAudio.recorder.stop.mockReturnValueOnce(stopped.promise);
  fakeAudio.recorderState = { ...fakeAudio.recorderState, durationMillis: 4200 };
  const { result, ends } = await recorder();

  await act(async () => result.current.start());
  let ending: Promise<void> = Promise.resolve();
  await act(async () => {
    ending = result.current.finish(true);
  });
  // Held again at once, while the first stops.
  await act(async () => result.current.start());
  expect(fakeAudio.recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);

  await act(async () => {
    stopped.resolve();
    await ending;
  });
  expect(ends).toEqual([
    { sent: { data: 'dm9pY2U=', durationMs: 4200, uri: 'file:///cache/voice.m4a' } },
  ]);
  await act(async () => result.current.start());
  expect(fakeAudio.recorder.prepareToRecordAsync).toHaveBeenCalledTimes(2);
});

it('stops and deletes a recording the screen leaves', async () => {
  const { result, unmount } = await recorder();
  await act(async () => result.current.start());
  expect(result.current.recording).toBe(true);

  await act(async () => unmount());

  expect(fakeAudio.recorder.stop).toHaveBeenCalled();
  expect(discardVoices).toHaveBeenCalledWith(['file:///cache/voice.m4a']);
  expect(setAudioModeAsync).toHaveBeenLastCalledWith({
    allowsRecording: false,
    playsInSilentMode: true,
  });
});

it('plays out of the speaker again when recording fails to start', async () => {
  // Failed twice, as it is prepared once more after a moment.
  fakeAudio.recorder.prepareToRecordAsync
    .mockRejectedValueOnce(new Error('busy'))
    .mockRejectedValueOnce(new Error('busy'));
  const { result, ends } = await recorder();

  await act(async () => {
    result.current.start();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  expect(ends).toEqual([{ problem: { reason: 'voice_not_recorded' } }]);
  expect(setAudioModeAsync).toHaveBeenLastCalledWith({
    allowsRecording: false,
    playsInSilentMode: true,
  });
});

it('lets the next recording start only once the audio is back to playback', async () => {
  const playback = deferred();
  const { result } = await recorder();

  // A tap: started and let go at once.
  await act(async () => result.current.start());
  jest.mocked(setAudioModeAsync).mockReturnValueOnce(playback.promise);
  let ending: Promise<void> = Promise.resolve();
  await act(async () => {
    ending = result.current.finish(true);
  });
  // Held again while the audio goes back to playback: nothing is prepared over it.
  await act(async () => result.current.start());
  expect(fakeAudio.recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);

  await act(async () => {
    playback.resolve();
    await ending;
  });
  await act(async () => result.current.start());
  expect(fakeAudio.recorder.prepareToRecordAsync).toHaveBeenCalledTimes(2);
});

it('prepares once more after a moment when the audio was not ready', async () => {
  fakeAudio.recorder.prepareToRecordAsync.mockRejectedValueOnce(
    new Error('Failed to prepare recorder'),
  );
  const { result, ends } = await recorder();

  await act(async () => {
    result.current.start();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  expect(fakeAudio.recorder.prepareToRecordAsync).toHaveBeenCalledTimes(2);
  expect(fakeAudio.recorder.record).toHaveBeenCalled();
  expect(ends).toEqual([]);
});

it('waits for the audio to settle after a message it paused', async () => {
  const { result } = await recorder();

  await act(async () => result.current.start({ afterPlayback: true }));
  expect(fakeAudio.recorder.prepareToRecordAsync).not.toHaveBeenCalled();

  await act(async () => new Promise((resolve) => setTimeout(resolve, 200)));
  expect(fakeAudio.recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
});
