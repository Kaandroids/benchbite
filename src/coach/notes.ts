// The notes Bite keeps in its notebook (#296, ADR 0071), as a message shows them: a line under the
// answer for each one it saved, changed or archived, and a card for one waiting for the user's
// yes, which saves it to the notebook or removes it (board 24).
import type { NoteCard } from '@shared/coach/chat';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Json } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

import { cardStatesKey, toolResultField } from './cards';
import { NOTES_KEY } from './notebook';
import type { ChatMessage } from './use-chat';

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

/** The notes a message shows a card for: those Bite asked to save. */
export function askedNotes(notes: NoteCard[] | undefined): NoteCard[] {
  return notes?.filter((note) => note.action === 'asked') ?? [];
}

/** The ids of the notes among `messages` that Bite asked to save. */
export function askedNoteIds(messages: ChatMessage[]): number[] {
  return messages.flatMap((message) => askedNotes(message.notes).map((note) => note.id));
}

/**
 * Where a note Bite asked about stands: still waiting for the user's yes, or saved. One the user
 * declined is gone, and has no state.
 */
export type AskedNoteState = 'asked' | 'saved';

const ASKED_NOTES_KEY = ['coach-asked-notes'];

type StateRow = { id: number; asked: boolean };

/**
 * Where the notes `ids` that Bite asked about stand, by id, read in one request. The last states
 * stay while new ones load, so that the cards on the screen keep theirs.
 */
export function useAskedNoteStates(ids: number[]) {
  return useQuery({
    queryKey: cardStatesKey(ASKED_NOTES_KEY, ids),
    enabled: ids.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<StateRow[]> => {
      const { data, error } = await supabase.from('coach_notes').select('id, asked').in('id', ids);
      if (error) throw error;
      return data;
    },
    select: (rows): Map<number, AskedNoteState> =>
      new Map(rows.map((row) => [row.id, row.asked ? 'asked' : 'saved'])),
  });
}

/**
 * Answers a note Bite asked about: saves it to the notebook, or removes it. Its new state goes
 * into every list of states that has it, and the notebook loads again.
 */
export function useAnswerNote(note: NoteCard) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (answer: 'save' | 'decline') => {
      const { error } =
        answer === 'save'
          ? await supabase.from('coach_notes').update({ asked: false }).eq('id', note.id)
          : await supabase.from('coach_notes').delete().eq('id', note.id);
      if (error) throw error;
    },
    // A load of the states under way may have read the note as it was, before the answer.
    onMutate: () => queryClient.cancelQueries({ queryKey: ASKED_NOTES_KEY }),
    onSuccess: (_, answer) => {
      queryClient.setQueriesData<StateRow[]>({ queryKey: ASKED_NOTES_KEY }, (rows) =>
        answer === 'save'
          ? rows?.map((row) => (row.id === note.id ? { ...row, asked: false } : row))
          : rows?.filter((row) => row.id !== note.id),
      );
      void queryClient.invalidateQueries({ queryKey: NOTES_KEY });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ASKED_NOTES_KEY }),
  });
}
