// The notes Bite keeps in its notebook (#296, ADR 0071), as a message shows them: a line under the
// answer for each one it saved, changed or archived. A note waiting for the user's yes gets a
// card of its own, which comes with the notebook.
import type { NoteCard } from '@shared/coach/chat';

import type { Json } from '@/lib/database.types';

import { toolResultField } from './cards';

export type { NoteCard };

const ACTIONS: readonly string[] = ['saved', 'asked', 'updated', 'archived'];

/** Whether `note` is a note card, as a tool's result keeps it. */
function isNoteCard(note: unknown): note is NoteCard {
  const value = note as Partial<NoteCard> | null;
  return (
    typeof value?.id === 'number' &&
    typeof value.text === 'string' &&
    typeof value.category === 'string' &&
    ACTIONS.includes(value.action ?? '')
  );
}

/** The notes a stored message of Bite's holds, in order. */
export function messageNotes(content: Json): NoteCard[] {
  return (Array.isArray(content) ? content : []).flatMap((part) => {
    const note = toolResultField(part, 'note');
    return isNoteCard(note) ? [note] : [];
  });
}

/** The notes a message shows a line for: those saved, changed or archived. */
export function shownNotes(notes: NoteCard[] | undefined): NoteCard[] {
  return notes?.filter((note) => note.action !== 'asked') ?? [];
}
