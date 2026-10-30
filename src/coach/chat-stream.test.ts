import { readEvents } from './chat-stream';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

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
