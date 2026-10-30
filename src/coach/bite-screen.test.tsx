import { router } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { act, fireEvent, render, screen } from '@/test/render';

import { BiteScreen } from './bite-screen';
import { type ChatEvent, type ChatRequest, streamChat } from './chat-stream';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/profile/display-name', () => ({ useDisplayName: () => ({ data: 'Sam' }) }));
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
