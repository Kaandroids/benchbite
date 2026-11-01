import { router } from 'expo-router';

import { act, fireEvent, render, screen } from '@/test/render';

import {
  type Note,
  useDeleteNote,
  useNotes,
  useRestoreNote,
  useSaveNote,
  useSavesNotes,
  useSetSavesNotes,
} from './notebook';
import { NotebookScreen } from './notebook-screen';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('./notebook', () => ({
  ...jest.requireActual('./notebook'),
  useNotes: jest.fn(),
  useDeleteNote: jest.fn(),
  useRestoreNote: jest.fn(),
  useSaveNote: jest.fn(),
  useSavesNotes: jest.fn(),
  useSetSavesNotes: jest.fn(),
}));

const note = (fields: Partial<Note> & Pick<Note, 'id' | 'category' | 'text'>): Note => ({
  source: 'chat',
  threadId: null,
  createdAt: new Date(2026, 9, 12, 18, 12),
  reviewOn: null,
  archivedAt: null,
  archiveReason: null,
  ...fields,
});

const NOTES: Note[] = [
  note({ id: 1, category: 'allergy', text: 'Allergic to walnuts', threadId: 7 }),
  note({ id: 2, category: 'health', text: 'Lactose intolerant', source: 'user' }),
  note({
    id: 3,
    category: 'injury',
    text: 'Left knee hurts on deep squats',
    createdAt: new Date(2026, 9, 31, 18, 12),
    reviewOn: '2026-11-06',
  }),
  note({
    id: 4,
    category: 'injury',
    text: 'Right shoulder hurts on bench press',
    archivedAt: new Date(2026, 9, 20),
    archiveReason: "You said it's fine now",
  }),
];

const deleteNote = jest.fn();
const restoreNote = jest.fn();
const saveNote = jest.fn();
const setSaves = jest.fn();

function notes(data: Note[]) {
  jest.mocked(useNotes).mockReturnValue({ data, isPending: false, isError: false } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date(2026, 10, 1, 15), doNotFake: ['nextTick'] });
  notes(NOTES);
  jest.mocked(useDeleteNote).mockReturnValue({ mutate: deleteNote, isError: false } as never);
  jest.mocked(useRestoreNote).mockReturnValue({ mutate: restoreNote, isError: false } as never);
  jest
    .mocked(useSaveNote)
    .mockReturnValue({ mutate: saveNote, isPending: false, isError: false } as never);
  jest.mocked(useSavesNotes).mockReturnValue({ data: true } as never);
  jest.mocked(useSetSavesNotes).mockReturnValue({ mutate: setSaves } as never);
});
afterEach(() => jest.useRealTimers());

it('shows the notes by section, where each came from, and when Bite asks again', async () => {
  await render(<NotebookScreen />);
  expect(screen.getByText('ALLERGIES AND HEALTH')).toBeTruthy();
  expect(screen.getByText('INJURIES')).toBeTruthy();
  expect(screen.queryByText('FOOD')).toBeNull();
  expect(screen.getByText('From a chat · Oct 12')).toBeTruthy();
  expect(screen.getByText('Added by you · Oct 12')).toBeTruthy();
  expect(screen.getByText('From a chat · Yesterday')).toBeTruthy();
  expect(screen.getByText("I'll ask again on Friday")).toBeTruthy();
  // Past notes are folded under their count.
  expect(screen.queryByText('Right shoulder hurts on bench press')).toBeNull();
});

it('switches saving notes from chats', async () => {
  await render(<NotebookScreen />);
  await fireEvent(screen.getByLabelText('Save notes from chats'), 'valueChange', false);
  expect(setSaves).toHaveBeenCalledWith(false);
});

it('opens a note, and its chat', async () => {
  await render(<NotebookScreen />);
  await fireEvent.press(screen.getByRole('button', { name: /^Allergic to walnuts/ }));
  expect(screen.getByText('Allergy')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Open' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/bite',
    params: { thread: '7', fresh: '', offer: '' },
  });
});

it('removes a note once its Undo has gone, and not when it is undone', async () => {
  await render(<NotebookScreen />);
  await fireEvent.press(screen.getByRole('button', { name: /^Lactose intolerant/ }));
  await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
  expect(screen.queryByText('Lactose intolerant')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getByText('Lactose intolerant')).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: /^Lactose intolerant/ }));
  await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
  expect(screen.getByText('Note removed')).toBeTruthy();
  await act(() => jest.advanceTimersByTime(5000));
  expect(deleteNote).toHaveBeenCalledTimes(1);
  expect(deleteNote).toHaveBeenCalledWith(2);
});

it('adds a note in the category picked', async () => {
  await render(<NotebookScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Add a note' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Food' }));
  await fireEvent.changeText(screen.getByLabelText('Note'), 'Vegetarian on weekdays');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(saveNote).toHaveBeenCalledWith(
    { id: undefined, category: 'food', text: 'Vegetarian on weekdays' },
    expect.anything(),
  );
});

it('restores a past note', async () => {
  await render(<NotebookScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Past notes · 1' }));
  expect(screen.getByText("Archived by Bite · Oct 20: You said it's fine now")).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Restore' }));
  expect(restoreNote).toHaveBeenCalledWith(4);
});

it('offers to add a note when there is none', async () => {
  notes([]);
  await render(<NotebookScreen />);
  expect(screen.getByText('Nothing here yet')).toBeTruthy();
  // The top bar's button and the empty notebook's both add one.
  await fireEvent.press(screen.getAllByRole('button', { name: 'Add a note' })[1]!);
  expect(screen.getByText('NOTE')).toBeTruthy();
});
