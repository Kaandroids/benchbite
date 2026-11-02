import { requestRecordingPermissionsAsync } from 'expo-audio';

import { supabase } from '@/lib/supabase';
import { fakeAudio } from '@/test/expo-audio';
import { act, fireEvent, render, screen, waitFor } from '@/test/render';

import { BiteScreen } from './bite-screen';
import { type ChatEvent, type ChatRequest, ChatRequestError, streamChat } from './chat-stream';
import { useThreadMessages } from './threads';

// Voice messages in Bite's chat (boards 1, 6 and 6b): held to record, sent as they are let go,
// written down by Bite's function, and played back from a saved chat.
let mockParams: { thread?: string; fresh?: string } = { thread: '', fresh: '1' };
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-file-system', () => ({
  // Every recording reads as the same data.
  File: jest.fn(() => ({
    exists: true,
    base64: () => Promise.resolve('dm9pY2U='),
    delete: jest.fn(),
  })),
  Paths: { cache: { uri: 'file:///cache/' } },
}));
jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } },
}));
jest.mock('@/profile/display-name', () => ({ useDisplayName: () => ({ data: 'Sam' }) }));
jest.mock('./threads', () => ({
  ...jest.requireActual('./threads'),
  useThreadMessages: jest.fn(() => ({ data: undefined })),
  useLastThread: jest.fn(() => ({ isPending: false, data: null })),
}));
jest.mock('./chat-stream', () => ({
  ...jest.requireActual('./chat-stream'),
  streamChat: jest.fn(),
}));

/** A stream the test plays: events sent with `send`, ended with `end`. */
function liveStream() {
  let onEvent: (event: ChatEvent) => void = () => {};
  let end: () => void = () => {};
  let request: Omit<ChatRequest, 'requestId'> | undefined;
  jest.mocked(streamChat).mockImplementation((req, listener) => {
    request = req;
    onEvent = listener;
    return new Promise<void>((resolve) => {
      end = resolve;
    });
  });
  return {
    send: (...events: ChatEvent[]) => act(async () => events.forEach((e) => onEvent(e))),
    end: () => act(async () => end()),
    request: () => request,
  };
}

const touch = (pageX: number) => ({ nativeEvent: { pageX } });

/** Holds the mic, which records once it has started. */
async function hold() {
  await fireEvent(
    screen.getByRole('button', { name: 'Hold to talk' }),
    'responderGrant',
    touch(300),
  );
}

/** Lets go of the mic, `slid` points left of where it was held. */
async function letGo(slid = 0) {
  const mic = screen.getByRole('button', { name: 'Recording, release to send' });
  if (slid) await fireEvent(mic, 'responderMove', touch(300 - slid));
  await fireEvent(mic, 'responderRelease', touch(300 - slid));
}

beforeEach(() => {
  jest.clearAllMocks();
  fakeAudio.reset();
  mockParams = { thread: '', fresh: '1' };
  jest.mocked(useThreadMessages).mockReturnValue({ data: undefined } as never);
  jest.mocked(supabase.rpc).mockResolvedValue({
    data: { allowed: true, reason: null, resets_at: '2026-11-01T00:00:00Z' },
    error: null,
  } as never);
});

it('records while the mic is held, and sends the voice message as it is let go', async () => {
  const stream = liveStream();
  await render(<BiteScreen />);
  fakeAudio.recorderState = { ...fakeAudio.recorderState, durationMillis: 4200 };

  await hold();
  expect(await screen.findByText('Listening…')).toBeOnTheScreen();
  expect(
    screen.getByText('0:04 · release to send', { includeHiddenElements: true }),
  ).toBeOnTheScreen();
  expect(screen.getByText('‹ slide to cancel')).toBeOnTheScreen();
  expect(fakeAudio.recorder.record).toHaveBeenCalled();
  await letGo();

  await waitFor(() => expect(streamChat).toHaveBeenCalled());
  const request = stream.request()!;
  expect(request.voice).toEqual({ mimeType: 'audio/mp4', data: 'dm9pY2U=' });
  expect(request.message).toBeUndefined();
  // Bite listens until what was said is written down, which then stands under the message.
  expect(screen.getByText('Listening to your message…')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Play voice message' })).toBeOnTheScreen();
  await stream.send({ event: 'transcript', text: 'Had a chicken rice bowl.' });
  expect(screen.getByText('Had a chicken rice bowl.')).toBeOnTheScreen();
  expect(screen.queryByText('Listening to your message…')).toBeNull();

  // It plays from its file on the device.
  await fireEvent.press(screen.getByRole('button', { name: 'Play voice message' }));
  expect(fakeAudio.player.replace).toHaveBeenCalledWith({ uri: 'file:///cache/voice.m4a' });
  expect(fakeAudio.player.play).toHaveBeenCalled();
  await stream.end();

  // Held again, what plays stops before anything records.
  await hold();
  await screen.findByText('Listening…');
  expect(fakeAudio.player.pause.mock.invocationCallOrder.at(-1)).toBeLessThan(
    fakeAudio.recorder.prepareToRecordAsync.mock.invocationCallOrder.at(-1)!,
  );
});

it('cancels a recording slid away to the left, and says how to record after a tap', async () => {
  liveStream();
  await render(<BiteScreen />);
  fakeAudio.recorderState = { ...fakeAudio.recorderState, durationMillis: 3000 };

  await hold();
  await screen.findByText('Listening…');
  await fireEvent(
    screen.getByRole('button', { name: 'Recording, release to send' }),
    'responderMove',
    touch(180),
  );
  expect(screen.getByText('Release to cancel')).toBeOnTheScreen();
  await letGo(120);
  await waitFor(() => expect(screen.queryByText('Listening…')).toBeNull());
  expect(fakeAudio.recorder.stop).toHaveBeenCalled();

  // A tap is too short to be a message.
  fakeAudio.recorderState = { ...fakeAudio.recorderState, durationMillis: 200 };
  await hold();
  await screen.findByText('Listening…');
  await letGo();
  expect(await screen.findByText('Hold the mic to record, then let go to send.')).toBeOnTheScreen();
  expect(streamChat).not.toHaveBeenCalled();
  // It goes as the user writes instead.
  await fireEvent.changeText(screen.getByLabelText('Message'), 'Hi');
  expect(screen.queryByText('Hold the mic to record, then let go to send.')).toBeNull();
});

it('asks for the microphone first, and says when it is not allowed', async () => {
  await render(<BiteScreen />);
  fakeAudio.permission = { ...fakeAudio.permission, granted: false, status: 'denied' };

  await hold();
  await waitFor(() => expect(requestRecordingPermissionsAsync).toHaveBeenCalled());
  expect(
    await screen.findByText('Bite needs the microphone to hear you. Allow it in the settings.'),
  ).toBeOnTheScreen();
  expect(fakeAudio.recorder.record).not.toHaveBeenCalled();
});

it('takes a voice message refused back out of the chat, and says why', async () => {
  jest.mocked(streamChat).mockRejectedValue(new ChatRequestError(413, 'voice_too_long'));
  await render(<BiteScreen />);
  fakeAudio.recorderState = { ...fakeAudio.recorderState, durationMillis: 4200 };

  await hold();
  await screen.findByText('Listening…');
  await letGo();

  expect(
    await screen.findByText('Voice messages can be up to a minute long. Try a shorter one.'),
  ).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Play voice message' })).toBeNull();
});

it('plays a voice message kept with a chat from its address', async () => {
  mockParams = { thread: '7' };
  jest.mocked(useThreadMessages).mockReturnValue({
    data: {
      title: null,
      messages: [
        {
          id: 'stored-1',
          role: 'user',
          text: 'Had a chicken rice bowl.',
          voice: { path: 'u/7/a.m4a', durationMs: 4200 },
        },
        { id: 'stored-2', role: 'bite', text: 'Logged it.' },
      ],
    },
    isFetchedAfterMount: true,
  } as never);
  jest.mocked(supabase.storage.from).mockReturnValue({
    createSignedUrls: jest.fn().mockResolvedValue({
      data: [{ path: 'u/7/a.m4a', signedUrl: 'https://media.test/u/7/a.m4a?token=1' }],
      error: null,
    }),
  } as never);
  await render(<BiteScreen />);

  expect(screen.getByText('Had a chicken rice bowl.')).toBeOnTheScreen();
  expect(screen.getByText('0:04', { includeHiddenElements: true })).toBeOnTheScreen();
  const play = screen.getByRole('button', { name: 'Play voice message' });
  await waitFor(() => expect(play).toBeEnabled());
  await fireEvent.press(play);
  expect(fakeAudio.player.replace).toHaveBeenCalledWith({
    uri: 'https://media.test/u/7/a.m4a?token=1',
  });
});
