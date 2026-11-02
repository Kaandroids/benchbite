import { firstMedia, messageText, storedMessages } from './threads';

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

  it('reads the meals Bite estimated back into its answer, leaving out what is no card', () => {
    const mealCard = {
      id: 51,
      day: '2026-10-30',
      meal: 'lunch',
      items: [
        {
          name: 'Pizza',
          searchName: 'Pizza',
          grams: 150,
          confidence: 0.9,
          per100: { kcal: 266, proteinG: 11, carbsG: 33, fatG: 10 },
          estimated: false,
        },
      ],
    };
    const messages = storedMessages([
      row(1, 'user'),
      {
        ...row(2, 'bite'),
        content: [
          { type: 'toolResult', name: 'log_meal_card', result: { mealCard } },
          { type: 'toolResult', name: 'log_meal_card', result: { error: 'Too many' } },
          { type: 'toolResult', name: 'log_meal_card', result: { mealCard: { id: 'x' } } },
          { type: 'text', text: 'A Margherita!' },
        ],
      },
    ]);

    expect(messages[0]?.mealCards).toBeUndefined();
    expect(messages[1]).toMatchObject({ text: 'A Margherita!', mealCards: [mealCard] });
  });

  it('reads the notes Bite kept back into its answer, leaving out what is no note', () => {
    const note = { id: 3, action: 'archived', category: 'injury', text: 'Knee hurts' };
    const messages = storedMessages([
      row(1, 'user'),
      {
        ...row(2, 'bite'),
        content: [
          { type: 'toolResult', name: 'archive_note', result: { note } },
          { type: 'toolResult', name: 'save_note', result: { note: { id: 4, action: 'x' } } },
          { type: 'text', text: 'Glad it healed.' },
        ],
      },
    ]);

    expect(messages[0]?.notes).toBeUndefined();
    expect(messages[1]).toMatchObject({ text: 'Glad it healed.', notes: [note] });
  });
});

it('tells what a chat begun without text began with, as the history does', () => {
  const photos = [{ path: 'u/1/a.jpg' }, { path: 'u/1/b.jpg' }];
  const voice = { path: 'u/1/c.m4a', durationMs: 4200 };
  const bite = { id: 'b', role: 'bite' as const, text: 'Two pizzas.' };
  const none = { firstPhotos: 0, firstVoice: false };
  expect(firstMedia([{ id: 'u', role: 'user', text: '', photos }, bite])).toEqual({
    ...none,
    firstPhotos: 2,
  });
  expect(firstMedia([{ id: 'u', role: 'user', text: 'These?', photos }, bite])).toEqual(none);
  // A voice message not written down; one that was is named by what was said.
  expect(firstMedia([{ id: 'u', role: 'user', text: '', voice }])).toEqual({
    ...none,
    firstVoice: true,
  });
  expect(firstMedia([{ id: 'u', role: 'user', text: 'Lunch', voice }])).toEqual(none);
  expect(firstMedia([{ id: 'u', role: 'user', text: '' }])).toEqual(none);
  expect(firstMedia([])).toEqual(none);
});

it('reads a voice message kept with a chat, with what was said in it', () => {
  const [message] = storedMessages([
    {
      id: 1,
      role: 'user',
      content: [
        { type: 'audio', path: 'u/1/c.m4a', mimeType: 'audio/mp4', durationMs: 4200 },
        { type: 'text', text: 'Had a chicken rice bowl.' },
      ],
      expression: null,
      interrupted: null,
      created_at: '2026-11-02T12:40:00Z',
    },
  ]);
  expect(message).toMatchObject({
    text: 'Had a chicken rice bowl.',
    voice: { path: 'u/1/c.m4a', durationMs: 4200 },
  });
});
