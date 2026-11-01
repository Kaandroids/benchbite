import { groupNotes, type Note, noteRefusal } from './notebook';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const note = (id: number, category: Note['category'], archivedAt: Date | null = null): Note => ({
  id,
  category,
  text: `Note ${id}`,
  source: 'chat',
  threadId: null,
  createdAt: new Date(2026, 9, id),
  reviewOn: null,
  archivedAt,
  archiveReason: archivedAt ? 'Healed' : null,
});

it('groups allergies with health, leaves out empty sections, and puts past notes apart', () => {
  const { sections, past } = groupNotes([
    note(1, 'food'),
    note(2, 'health'),
    note(3, 'allergy'),
    note(4, 'injury', new Date(2026, 9, 20)),
    note(5, 'goal', new Date(2026, 9, 26)),
  ]);
  expect(sections.map((section) => [section.key, section.notes.map((n) => n.id)])).toEqual([
    ['health', [2, 3]],
    ['food', [1]],
  ]);
  // Last archived first.
  expect(past.map((n) => n.id)).toEqual([5, 4]);
});

it('tells a full notebook from one that keeps too many', () => {
  expect(noteRefusal({ code: 'BB046' })).toBe('full');
  expect(noteRefusal({ code: 'BB047' })).toBe('kept');
  expect(noteRefusal({ code: '23514' })).toBeUndefined();
  expect(noteRefusal(new Error('offline'))).toBeUndefined();
});
