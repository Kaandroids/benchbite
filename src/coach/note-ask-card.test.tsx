import { render, screen } from '@/test/render';

import { NoteAskCard } from './note-ask-card';
import type { NoteCard } from './notes';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

const NOTE = { id: 3, category: 'food', text: 'Vegetarian', action: 'asked' } as NoteCard;

it('asks whether to keep a note', async () => {
  await render(<NoteAskCard note={NOTE} />);

  expect(screen.getByRole('button', { name: 'Save to notebook' })).toBeOnTheScreen();
});

it('offers nothing to do when only to read', async () => {
  await render(<NoteAskCard note={NOTE} readOnly />);

  expect(screen.getByText('Food: Vegetarian')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Save to notebook' })).toBeNull();
});
