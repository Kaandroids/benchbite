import { supabase } from '@/lib/supabase';

import { readEvents, streamChat } from './chat-stream';

const REQUEST_ID = '7b0f4d0e-2f6c-4c1a-9d43-5d0a8f1c2e11';

jest.mock('expo-crypto', () => ({ randomUUID: () => '7b0f4d0e-2f6c-4c1a-9d43-5d0a8f1c2e11' }));
jest.mock('@/lib/supabase', () => {
  const rpc = jest.fn();
  return {
    supabase: { auth: { getSession: () => Promise.resolve({ data: {} }) }, rpc },
    functionUrl: (name: string) => `https://example.test/functions/v1/${name}`,
    publishableKey: 'key',
  };
});

describe('readEvents', () => {
  it('reads the complete events and keeps the rest for the next read', () => {
    const { events, rest } = readEvents(
      'event: expression\ndata: {"expression":"happy"}\n\nevent: text\ndata: {"text":"Hi"}\n\nevent: te',
    );

    expect(events).toEqual([
      { event: 'expression', expression: 'happy' },
      { event: 'text', text: 'Hi' },
    ]);
    expect(rest).toBe('event: te');
  });

  it('reads events that end in carriage returns', () => {
    expect(readEvents('event: done\r\ndata: {"threadId":1,"messageId":2}\r\n\r\n').events).toEqual([
      { event: 'done', threadId: 1, messageId: 2 },
    ]);
  });

  it('leaves out an event it cannot read', () => {
    expect(readEvents('event: text\ndata: {broken\n\nevent: x\n\n').events).toEqual([]);
  });
});

describe('streamChat', () => {
  /** A stream of `chunks`, read one after another; the last read waits for `end`. */
  function respond(...chunks: string[]) {
    let end: () => void = () => {};
    const ended = new Promise<void>((resolve) => (end = resolve));
    const encoder = new TextEncoder();
    const reads = chunks.map((chunk) => ({ done: false, value: encoder.encode(chunk) }));
    const read = jest.fn(async () => reads.shift() ?? ended.then(() => ({ done: true })));
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, body: { getReader: () => ({ read }) } });
    return { end };
  }

  const then = jest.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(supabase.rpc).mockReturnValue({ then } as never);
  });

  it('names the request, and tells the server that name when it is stopped', async () => {
    const { end } = respond('event: text\ndata: {"text":"Hi"}\n\n');
    const controller = new AbortController();
    // Stopped once the first words came.
    await streamChat(
      { message: 'Hi', language: 'en', today: '2026-10-30' },
      () => {
        controller.abort();
        end();
      },
      controller.signal,
    );

    const body = JSON.parse(jest.mocked(fetch).mock.calls[0]![1]?.body as string);
    expect(body).toMatchObject({ message: 'Hi', requestId: REQUEST_ID });
    expect(supabase.rpc).toHaveBeenCalledWith('stop_coach_request', { request_id: REQUEST_ID });
    // The query is run, not only built.
    expect(then).toHaveBeenCalled();
  });

  it('tells the server nothing once the answer ended', async () => {
    const { end } = respond();
    const controller = new AbortController();
    const done = streamChat(
      { message: 'Hi', language: 'en', today: '2026-10-30' },
      () => {},
      controller.signal,
    );
    end();
    await done;

    controller.abort();

    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
