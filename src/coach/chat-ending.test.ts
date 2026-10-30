import { afterEvent, afterStream, beginning, type Ending } from './chat-ending';
import type { ChatEvent } from './chat-stream';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

/** The ending of a message sent in `threadId`, after `events`. */
const read = (threadId: number | undefined, ...events: ChatEvent[]): Ending =>
  events.reduce(afterEvent, beginning(threadId));

it('goes on in the thread of an answer that came whole', () => {
  const ending = afterStream(
    read(
      undefined,
      { event: 'thread', threadId: 7 },
      { event: 'text', text: 'A good week.' },
      { event: 'done', threadId: 7, messageId: 9 },
    ),
    'closed',
  );

  expect(ending).toMatchObject({ threadId: 7, cut: undefined });
  expect(ending.failure).toBeUndefined();
});

it('says an answer cut at its limit was cut off, and one the model broke off failed', () => {
  const said = { event: 'text', text: 'Your week' } as const;
  expect(
    read(7, said, { event: 'done', threadId: 7, messageId: 9, interrupted: 'cut' }),
  ).toMatchObject({
    cut: 'cut_off',
  });
  expect(
    read(7, said, { event: 'done', threadId: 7, messageId: 9, interrupted: 'cut' }).failure,
  ).toBeUndefined();
  expect(
    read(7, said, {
      event: 'done',
      threadId: 7,
      messageId: 9,
      interrupted: 'failed',
      reason: 'unavailable',
    }),
  ).toMatchObject({ cut: 'cut_off', failure: 'unavailable' });
});

it('says why an answer was refused, as a refusal or a failure', () => {
  expect(read(7, { event: 'error', reason: 'limit_reached' })).toMatchObject({
    refusal: 'limit_reached',
  });
  expect(read(7, { event: 'error', reason: 'limit_reached' }).failure).toBeUndefined();
  expect(read(7, { event: 'error', reason: 'call_in_progress' }).failure).toBe('call_in_progress');
  expect(read(7, { event: 'error', reason: 'unpriced_model' }).failure).toBe('unavailable');
});

it('gives up a new thread the function dropped, and keeps one it kept', () => {
  const thread = { event: 'thread', threadId: 7 } as const;
  expect(read(3, thread, { event: 'error', reason: 'unavailable', dropped: true }).threadId).toBe(
    3,
  );
  expect(read(undefined, thread, { event: 'error', reason: 'unavailable' }).threadId).toBe(7);
});

it('starts a new thread after one too long to go on with', () => {
  expect(read(7, { event: 'error', reason: 'request_too_large' }).threadId).toBeUndefined();
});

it('does not call an answer cut off that came whole but was not saved', () => {
  const ending = read(7, { event: 'text', text: 'Hi' }, { event: 'error', reason: 'not_saved' });
  expect(ending).toMatchObject({ cut: undefined, failure: 'not_saved' });
});

it('says an answer that ends without its end was cut off', () => {
  const ending = afterStream(read(7, { event: 'text', text: 'Your' }), 'closed');
  expect(ending).toMatchObject({ cut: 'cut_off', failure: 'unavailable' });
});

it('keeps the thread of an answer stopped after it began, and gives up a new one stopped before', () => {
  const thread = { event: 'thread', threadId: 7 } as const;
  expect(
    afterStream(read(undefined, thread, { event: 'text', text: 'Hi' }), 'stopped'),
  ).toMatchObject({
    threadId: 7,
    cut: 'stopped',
  });
  expect(afterStream(read(undefined, thread), 'stopped').threadId).toBeUndefined();
  expect(afterStream(read(3), 'stopped').threadId).toBe(3);
});

it('starts a new thread when its thread is gone, and keeps it on any other failure', () => {
  expect(afterStream(read(7), 'failed', 404)).toMatchObject({
    threadId: undefined,
    failure: 'unavailable',
  });
  expect(afterStream(read(7), 'failed', 500).threadId).toBe(7);
  expect(afterStream(read(7), 'failed').threadId).toBe(7);
});
