import { router } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { act, fireEvent, render, screen } from '@/test/render';

import { BiteScreen } from './bite-screen';
import { useLastThread, useThreadMessages } from './threads';
import { type ChatEvent, type ChatRequest, ChatRequestError, streamChat } from './chat-stream';

// A new chat by default; the tab bar's opening, without params, is tested on its own.
const NEW_CHAT = { thread: '', fresh: '1' };
let mockParams: { thread?: string; fresh?: string; offer?: string; from?: string } = NEW_CHAT;
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
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

/** Lets ai_access() answer with `reason`, or allow the user. */
function access(reason: string | null = null) {
  jest.mocked(supabase.rpc).mockResolvedValue({
    data: { allowed: reason === null, reason, resets_at: '2026-11-01T00:00:00Z' },
    error: null,
  } as never);
}

/** A stream the test plays: events sent with `send`, ended with `end`. */
function liveStream() {
  let onEvent: (event: ChatEvent) => void = () => {};
  let end: () => void = () => {};
  let request: ChatRequest | undefined;
  let signal: AbortSignal | undefined;
  jest.mocked(streamChat).mockImplementation((req, listener, abort) => {
    request = req;
    onEvent = listener;
    signal = abort;
    return new Promise<void>((resolve, reject) => {
      end = resolve;
      abort?.addEventListener('abort', () => reject(new Error('aborted')));
    });
  });
  return {
    send: (...events: ChatEvent[]) => act(async () => events.forEach((e) => onEvent(e))),
    end: () => act(async () => end()),
    request: () => request,
    aborted: () => signal?.aborted,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // No saved chat unless a test opens one.
  jest.mocked(useThreadMessages).mockReturnValue({ data: undefined } as never);
  access();
});

it('greets the user by name, with questions to ask', async () => {
  await render(<BiteScreen />);

  expect(screen.getByText("Hi Sam, I'm Bite")).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'How was my week?' })).toBeOnTheScreen();
  expect(screen.getByText('Bite can make mistakes. Check important info.')).toBeOnTheScreen();
});

it('asks a suggested question, shows Bite looking it up, then its answer as it comes', async () => {
  const stream = liveStream();
  await render(<BiteScreen />);

  await fireEvent.press(screen.getByRole('button', { name: 'How was my week?' }));

  expect(stream.request()).toMatchObject({ message: 'How was my week?', language: 'en' });
  expect(stream.request()?.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(screen.getByText('How was my week?')).toBeOnTheScreen();
  expect(screen.getByLabelText('Bite is thinking')).toBeOnTheScreen();

  await stream.send({ event: 'tool_start', name: 'get_week_summary' });
  expect(screen.getByText('Looking at your week…')).toBeOnTheScreen();

  await stream.send(
    { event: 'tool_end', name: 'get_week_summary' },
    { event: 'expression', expression: 'happy' },
    { event: 'text', text: 'A strong ' },
    { event: 'text', text: 'week!' },
  );
  expect(screen.getByText('A strong week!')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Stop' })).toBeOnTheScreen();

  await stream.send({ event: 'done', threadId: 7, messageId: 9 });
  await stream.end();
  expect(screen.getByRole('button', { name: 'Send' })).toBeOnTheScreen();
});

it('goes on in the same thread with the next message', async () => {
  const stream = liveStream();
  await render(<BiteScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'How was my week?' }));
  await stream.send({ event: 'text', text: 'Good.' }, { event: 'done', threadId: 7, messageId: 9 });
  await stream.end();

  await fireEvent.changeText(screen.getByLabelText('Message'), 'And today?');
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

  expect(stream.request()).toMatchObject({ message: 'And today?', threadId: 7 });
});

it('stops an answer, keeping what came of it', async () => {
  const stream = liveStream();
  await render(<BiteScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'How was my week?' }));
  await stream.send({ event: 'text', text: 'Your week was' });

  await fireEvent.press(screen.getByRole('button', { name: 'Stop' }));

  expect(stream.aborted()).toBe(true);
  expect(screen.getByText('Your week was')).toBeOnTheScreen();
  expect(screen.queryByText(/couldn't answer/)).toBeNull();
});

describe('a message sent right after a stop', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['nextTick'] }));
  afterEach(() => jest.useRealTimers());

  /** Stops an answer, then sends 'And today?', which the server refuses as one at a time. */
  async function refusedAfterStop() {
    const stream = liveStream();
    await render(<BiteScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'How was my week?' }));
    await stream.send({ event: 'text', text: 'Your week was' });
    await fireEvent.press(screen.getByRole('button', { name: 'Stop' }));
    await fireEvent.changeText(screen.getByLabelText('Message'), 'And today?');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    await stream.send({ event: 'error', reason: 'call_in_progress' });
    await stream.end();
    return stream;
  }

  it('is sent again once the stopped answer let its place go', async () => {
    const stream = await refusedAfterStop();

    await act(() => jest.advanceTimersByTime(1500));
    await stream.send({ event: 'text', text: 'Today you rest.' });
    await stream.end();

    expect(streamChat).toHaveBeenCalledTimes(3);
    expect(stream.request()).toMatchObject({ message: 'And today?' });
    expect(screen.getByText('Today you rest.')).toBeOnTheScreen();
    expect(screen.queryByText(/another device/)).toBeNull();
  });

  it('is not sent again when it is stopped meanwhile', async () => {
    await refusedAfterStop();

    await fireEvent.press(screen.getByRole('button', { name: 'Stop' }));
    await act(() => jest.advanceTimersByTime(1500));

    expect(streamChat).toHaveBeenCalledTimes(2);
  });
});

it('says so when Bite could not answer', async () => {
  jest.mocked(streamChat).mockRejectedValue(new Error('offline'));
  await render(<BiteScreen />);

  await fireEvent.press(screen.getByRole('button', { name: 'How was my week?' }));

  expect(await screen.findByText("Bite couldn't answer just now. Try again.")).toBeOnTheScreen();
  expect(screen.queryByLabelText('Bite is thinking')).toBeNull();
});

it('shows why the user cannot chat in place of the composer', async () => {
  access('limit_reached');
  await render(<BiteScreen />);

  expect(await screen.findByText("You've used Bite for this month")).toBeOnTheScreen();
  expect(screen.getByText(/I'm back on November 1/)).toBeOnTheScreen();
  expect(screen.queryByLabelText('Message')).toBeNull();
  expect(screen.queryByRole('button', { name: 'How was my week?' })).toBeNull();
});

it('tells a user without a plan that Bite comes with one', async () => {
  access('plan_required');
  await render(<BiteScreen />);

  expect(await screen.findByText('Bite comes with a plan')).toBeOnTheScreen();
});

it('offers a guest an account', async () => {
  access('account_required');
  await render(<BiteScreen />);

  await fireEvent.press(await screen.findByRole('button', { name: 'Create an account' }));

  expect(router.push).toHaveBeenCalledWith('/account/create');
});

it('shows a refusal that comes with an answer', async () => {
  const stream = liveStream();
  await render(<BiteScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'How was my week?' }));

  await stream.send({ event: 'error', reason: 'limit_reached' });
  await stream.end();

  expect(screen.getByText("You've used Bite for this month")).toBeOnTheScreen();
});

it('closes', async () => {
  await render(<BiteScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(router.back).toHaveBeenCalled();
});

it('goes on in the thread of an answer that was stopped', async () => {
  const stream = liveStream();
  await render(<BiteScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'How was my week?' }));
  await stream.send({ event: 'thread', threadId: 7 }, { event: 'text', text: 'Your week' });
  await fireEvent.press(screen.getByRole('button', { name: 'Stop' }));

  await fireEvent.changeText(screen.getByLabelText('Message'), 'And today?');
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

  expect(stream.request()).toMatchObject({ message: 'And today?', threadId: 7 });
});

it('shows a lookup Bite makes after it started writing', async () => {
  const stream = liveStream();
  await render(<BiteScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'How was my week?' }));

  await stream.send(
    { event: 'text', text: 'Let me check.' },
    { event: 'tool_start', name: 'get_records' },
  );

  expect(screen.getByText('Let me check.')).toBeOnTheScreen();
  expect(screen.getByText('Checking your records…')).toBeOnTheScreen();
});

it('says an answer was stopped, under what came of it', async () => {
  const stream = liveStream();
  await render(<BiteScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'How was my week?' }));
  await stream.send({ event: 'text', text: 'Your week' });

  await fireEvent.press(screen.getByRole('button', { name: 'Stop' }));

  expect(screen.getByText('Stopped')).toBeOnTheScreen();
});

it('says a question was not answered, and asks it again', async () => {
  const stream = liveStream();
  await render(<BiteScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'How was my week?' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Stop' }));

  expect(screen.getByText('Not answered')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Ask again' }));

  expect(streamChat).toHaveBeenCalledTimes(2);
  expect(stream.request()).toMatchObject({ message: 'How was my week?' });
  // It moves down, to be answered there, rather than staying unanswered above.
  expect(screen.getAllByText('How was my week?')).toHaveLength(1);
  expect(screen.queryByText('Not answered')).toBeNull();
});

it('says an answer was cut off, and tries the question again', async () => {
  const stream = liveStream();
  await render(<BiteScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'How was my week?' }));
  await stream.send(
    { event: 'text', text: 'Your week' },
    { event: 'error', reason: 'unavailable' },
  );
  await stream.end();

  expect(screen.getByText('Cut off')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

  expect(streamChat).toHaveBeenCalledTimes(2);
});

it('offers to try again an answer the model broke off, but not one cut at its limit', async () => {
  const stream = liveStream();
  await render(<BiteScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'How was my week?' }));
  await stream.send(
    { event: 'text', text: 'Your week' },
    { event: 'done', threadId: 7, messageId: 9, interrupted: 'cut' },
  );
  await stream.end();

  expect(screen.getByText('Cut off')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();

  await fireEvent.changeText(screen.getByLabelText('Message'), 'And today?');
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
  await stream.send(
    { event: 'text', text: 'Today' },
    { event: 'done', threadId: 7, messageId: 11, interrupted: 'failed', reason: 'unavailable' },
  );
  await stream.end();

  expect(screen.getByText("Bite couldn't answer just now. Try again.")).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(stream.request()?.message).toBe('And today?');
});

it('says why an answer was refused after it began', async () => {
  const stream = liveStream();
  await render(<BiteScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'How was my week?' }));
  await stream.send(
    { event: 'text', text: 'Let me check.' },
    {
      event: 'done',
      threadId: 7,
      messageId: 9,
      interrupted: 'refused',
      reason: 'call_in_progress',
    },
  );
  await stream.end();

  expect(screen.getByText('Cut off')).toBeOnTheScreen();
  expect(
    screen.getByText('Bite is answering on another device. Try again in a moment.'),
  ).toBeOnTheScreen();
});

it('says when Bite answers on another device', async () => {
  const stream = liveStream();
  await render(<BiteScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'How was my week?' }));
  await stream.send({ event: 'error', reason: 'call_in_progress' });
  await stream.end();

  expect(
    screen.getByText('Bite is answering on another device. Try again in a moment.'),
  ).toBeOnTheScreen();
});

it('forgets the new thread of a message that was refused', async () => {
  const stream = liveStream();
  await render(<BiteScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'How was my week?' }));
  await stream.send(
    { event: 'thread', threadId: 7 },
    { event: 'error', reason: 'call_in_progress', dropped: true },
  );
  await stream.end();

  await fireEvent.press(screen.getByRole('button', { name: 'Ask again' }));

  expect(stream.request()?.threadId).toBeUndefined();
});

it('keeps the new thread of a question that stays in it unanswered', async () => {
  const stream = liveStream();
  await render(<BiteScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'How was my week?' }));
  await stream.send({ event: 'thread', threadId: 7 }, { event: 'error', reason: 'unavailable' });
  await stream.end();

  await fireEvent.press(screen.getByRole('button', { name: 'Ask again' }));

  expect(stream.request()?.threadId).toBe(7);
});

it('starts a new thread when its thread is gone', async () => {
  const stream = liveStream();
  await render(<BiteScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'How was my week?' }));
  await stream.send({ event: 'thread', threadId: 7 }, { event: 'error', reason: 'unavailable' });
  await stream.end();
  jest.mocked(streamChat).mockRejectedValueOnce(new ChatRequestError(404));
  await fireEvent.press(screen.getByRole('button', { name: 'Ask again' }));

  await fireEvent.press(screen.getByRole('button', { name: 'Ask again' }));

  expect(stream.request()?.threadId).toBeUndefined();
});

it('says an answer was cut off when it ends without its end', async () => {
  const stream = liveStream();
  await render(<BiteScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'How was my week?' }));
  await stream.send({ event: 'text', text: 'Your week' });

  await stream.end();

  expect(screen.getByText('Cut off')).toBeOnTheScreen();
  expect(screen.getByText("Bite couldn't answer just now. Try again.")).toBeOnTheScreen();
});

it('does not call an answer cut off that came whole but was not saved', async () => {
  const stream = liveStream();
  await render(<BiteScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'How was my week?' }));
  await stream.send(
    { event: 'text', text: 'A good week.' },
    { event: 'error', reason: 'not_saved' },
  );
  await stream.end();

  expect(screen.getByText("This answer couldn't be saved.")).toBeOnTheScreen();
  expect(screen.queryByText('Cut off')).toBeNull();
});

it('goes on in a saved chat, with its name and messages, and opens the chats', async () => {
  const stream = liveStream();
  mockParams = { thread: '7' };
  jest.mocked(useThreadMessages).mockReturnValue({
    isFetchedAfterMount: true,
    data: {
      title: 'Knee pain on squats',
      messages: [
        { id: 'stored-1', role: 'user', text: 'My knee hurts.' },
        {
          id: 'stored-2',
          role: 'bite',
          text: 'Try leg press today.',
          expression: 'neutral',
        },
      ],
    },
  } as never);
  await render(<BiteScreen />);
  expect(screen.getByText('Knee pain on squats')).toBeTruthy();
  expect(screen.getByText('Try leg press today.')).toBeTruthy();

  await fireEvent.changeText(screen.getByLabelText('Message'), 'And tomorrow?');
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
  expect(stream.request()?.threadId).toBe(7);

  await fireEvent.press(screen.getByRole('button', { name: 'Chats' }));
  expect(router.push).toHaveBeenCalledWith('/bite/chats');
  mockParams = NEW_CHAT;
});

it('goes back to the chats from a chat opened over them', async () => {
  liveStream();
  mockParams = { thread: '7', from: 'chats' };
  jest.mocked(useThreadMessages).mockReturnValue({
    isFetchedAfterMount: true,
    data: { title: 'Knee pain on squats', messages: [] },
  } as never);
  await render(<BiteScreen />);
  expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Chats' }));

  expect(router.back).toHaveBeenCalledTimes(2);
  expect(router.push).not.toHaveBeenCalled();
  mockParams = NEW_CHAT;
});

it('starts a new chat when the saved one is gone', async () => {
  liveStream();
  mockParams = { thread: '7' };
  jest
    .mocked(useThreadMessages)
    .mockReturnValue({ isFetchedAfterMount: true, data: null } as never);
  await render(<BiteScreen />);
  expect(screen.getByRole('button', { name: 'How was my week?' })).toBeTruthy();
  mockParams = NEW_CHAT;
});

it('waits for a saved chat as it is now, not as it was kept', async () => {
  mockParams = { thread: '7' };
  jest.mocked(useThreadMessages).mockReturnValue({
    isFetchedAfterMount: false,
    isPending: false,
    isError: false,
    isFetching: true,
    data: { title: 'Old', messages: [{ id: 'stored-1', role: 'user', text: 'Kept from before' }] },
  } as never);
  await render(<BiteScreen />);
  expect(screen.queryByText('Kept from before')).toBeNull();
  mockParams = NEW_CHAT;
});

describe('opened from the tab bar', () => {
  const lastChat = (hoursAgo: number) => ({
    id: 9,
    title: 'Knee pain on squats',
    lastMessageAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    lastMessage: 'Try leg press.',
    expression: 'neutral' as const,
  });
  afterEach(() => {
    mockParams = NEW_CHAT;
    jest.mocked(useLastThread).mockReturnValue({ isPending: false, data: null } as never);
  });

  it('goes on in the last chat while it is recent, deciding once', async () => {
    mockParams = {};
    jest.mocked(useLastThread).mockReturnValue({ isPending: false, data: lastChat(2) } as never);
    await render(<BiteScreen />);
    expect(router.setParams).toHaveBeenCalledWith({ thread: '9', fresh: '', offer: '' });
  });

  it('starts a new chat after six hours, offering the last', async () => {
    mockParams = {};
    jest.mocked(useLastThread).mockReturnValue({ isPending: false, data: lastChat(8) } as never);
    await render(<BiteScreen />);
    expect(router.setParams).toHaveBeenCalledWith({
      thread: '',
      fresh: expect.stringMatching(/^\d+$/),
      offer: '9',
    });
  });

  it('offers the last chat to continue, and all chats', async () => {
    mockParams = { thread: '', fresh: '1', offer: '9' };
    jest.mocked(useLastThread).mockReturnValue({ isPending: false, data: lastChat(8) } as never);
    await render(<BiteScreen />);
    expect(screen.getByText('CONTINUE')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /Knee pain on squats/ }));
    expect(router.setParams).toHaveBeenCalledWith({ thread: '9', fresh: '', offer: '' });
    await fireEvent.press(screen.getByRole('button', { name: 'All chats' }));
    expect(router.push).toHaveBeenCalledWith('/bite/chats');
  });

  it('offers nothing to continue on a new chat asked for from the chats', async () => {
    jest.mocked(useLastThread).mockReturnValue({ isPending: false, data: lastChat(8) } as never);
    await render(<BiteScreen />);
    expect(screen.queryByText('CONTINUE')).toBeNull();
  });

  it('keeps a new chat open when its own first message makes it the last chat', async () => {
    const stream = liveStream();
    const { rerender } = await render(<BiteScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'How was my week?' }));
    await stream.send({ event: 'thread', threadId: 9 }, { event: 'text', text: 'A quiet week.' });
    jest.mocked(useLastThread).mockReturnValue({ isPending: false, data: lastChat(0) } as never);
    await rerender(<BiteScreen />);
    expect(screen.getByText('A quiet week.')).toBeTruthy();
    expect(router.setParams).not.toHaveBeenCalled();
    expect(stream.aborted()).toBeFalsy();
  });
});

it('shows when each day of a chat over several days began', async () => {
  mockParams = { thread: '7' };
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  jest.mocked(useThreadMessages).mockReturnValue({
    isFetchedAfterMount: true,
    data: {
      title: 'Knee',
      messages: [
        { id: 'stored-1', role: 'user', text: 'My knee hurts.', createdAt: yesterday },
        { id: 'stored-2', role: 'bite', text: 'Rest it.', createdAt: new Date() },
      ],
    },
  } as never);
  await render(<BiteScreen />);
  expect(screen.getByText(/^Yesterday /)).toBeTruthy();
  expect(screen.getByText(/^Today /)).toBeTruthy();
  mockParams = NEW_CHAT;
  jest.mocked(useThreadMessages).mockReturnValue({ data: undefined } as never);
});
