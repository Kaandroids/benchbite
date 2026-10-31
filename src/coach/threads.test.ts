import { messageText, storedMessages } from './threads';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('messageText', () => {
  it('reads the text parts of a message, in order', () => {
    expect(
      messageText([
        { type: 'text', text: 'One' },
        { type: 'toolCall', name: 'get_records', args: {} },
        { type: 'text', text: 'two' },
      ]),
    ).toBe('One\ntwo');
  });

  it('reads nothing of content that is not a list of parts', () => {
    expect(messageText(null)).toBe('');
    expect(messageText({ type: 'text', text: 'x' })).toBe('');
  });
});

describe('storedMessages', () => {
  const row = (id: number, role: 'user' | 'bite', interrupted: string | null = null) => ({
    id,
    role,
    content: [{ type: 'text', text: `Message ${id}` }],
    expression: role === 'bite' ? ('happy' as const) : null,
    interrupted: interrupted as 'stopped' | 'cut' | null,
    created_at: '2026-10-30T12:00:00Z',
  });

  it('says how an answer that stopped short ended, as it did when it came', () => {
    const messages = storedMessages([
      row(1, 'user'),
      row(2, 'bite', 'stopped'),
      row(3, 'user'),
      row(4, 'bite', 'cut'),
      row(5, 'user'),
      row(6, 'bite'),
    ]);

    expect(messages.map((message) => message.cut)).toEqual([
      undefined,
      'stopped',
      undefined,
      'cut_off',
      undefined,
      undefined,
    ]);
  });

  it('shows a question no answer followed as not answered', () => {
    const messages = storedMessages([row(1, 'user'), row(2, 'bite'), row(3, 'user')]);

    expect(messages.map((message) => message.unanswered)).toEqual([undefined, undefined, true]);
  });

  it("reads the user's photos back, with or without text", () => {
    const messages = storedMessages([
      {
        ...row(1, 'user'),
        content: [
          { type: 'image', path: 'u/1/a.jpg', mimeType: 'image/jpeg' },
          { type: 'image', path: 'u/1/b.jpg', mimeType: 'image/jpeg' },
        ],
      },
      row(2, 'bite'),
      row(3, 'user'),
    ]);

    expect(messages[0]).toMatchObject({
      text: '',
      photos: [{ path: 'u/1/a.jpg' }, { path: 'u/1/b.jpg' }],
    });
    expect(messages[2]?.photos).toBeUndefined();
  });

  it('reads the changes Bite proposed back into its answer', () => {
    const proposal = {
      kind: 'targets',
      id: 8,
      to: { calories: 2100, proteinG: 150, carbsG: 220, fatG: 70 },
    };
    const messages = storedMessages([
      row(1, 'user'),
      {
        ...row(2, 'bite'),
        content: [
          { type: 'toolCall', name: 'propose_targets_change', args: {} },
          { type: 'toolResult', name: 'propose_targets_change', result: { proposal } },
        ],
      },
    ]);

    expect(messages[0]?.proposals).toBeUndefined();
    expect(messages[1]).toMatchObject({ text: '', proposals: [proposal] });
  });
});
