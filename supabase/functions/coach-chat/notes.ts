// Bite's notebook (#296, ADR 0071): a note in a tool's result, and how Bite reads it back in the
// history. Where a note stands now, the snapshot tells: it lists the notes in use.
import type { NoteCard } from '../_shared/coach/chat.ts';

/** The note a tool's result holds, if it saved, changed or archived one. */
export function noteOf(result: unknown): NoteCard | undefined {
  return (result as { note?: NoteCard } | null)?.note;
}

const DONE: Record<NoteCard['action'], string> = {
  saved: 'Saved a note',
  asked: 'Asked the user to save a note',
  updated: 'Changed a note',
  archived: 'Archived a note',
};

/** A note as Bite reads it back in the history, which untags the message's text as one. */
export function noteText(note: NoteCard): string {
  return `(${DONE[note.action]}, #${note.id}, ${note.category}: ${note.text})`;
}
