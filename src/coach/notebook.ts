// Bite's notebook (#296, ADR 0071): the notes Bite keeps about the user, which they read, add,
// change, remove and restore here, as plain rows under row level security, and whether Bite saves
// notes from chats by itself.
import type { NoteCategory } from '@shared/coach/chat';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

export type { NoteCategory };

type NoteRow = Database['public']['Tables']['coach_notes']['Row'];

/** A note as the notebook shows it. Notes waiting for the user's yes are not among them. */
export type Note = {
  id: number;
  category: NoteCategory;
  text: string;
  source: NoteRow['source'];
  /** The chat a note of Bite's came from, when it is still there. */
  threadId: number | null;
  createdAt: Date;
  /** The day Bite asks again whether it still holds, YYYY-MM-DD. */
  reviewOn: string | null;
  /** When Bite archived it, and why: a past note. */
  archivedAt: Date | null;
  archiveReason: string | null;
};

/** The longest a note may be, as `coach_notes` checks it. */
export const MAX_NOTE_LENGTH = 200;

/** The categories in the order the add sheet offers them. */
export const NOTE_CATEGORIES: readonly NoteCategory[] = [
  'allergy',
  'health',
  'injury',
  'training',
  'food',
  'goal',
  'lifestyle',
];

/** The notebook's sections, in order: allergies share one with health (board 20). */
export const NOTEBOOK_SECTIONS = [
  { key: 'health', categories: ['allergy', 'health'] },
  { key: 'injury', categories: ['injury'] },
  { key: 'training', categories: ['training'] },
  { key: 'food', categories: ['food'] },
  { key: 'goal', categories: ['goal'] },
  { key: 'lifestyle', categories: ['lifestyle'] },
] as const satisfies readonly { key: string; categories: readonly NoteCategory[] }[];

export type NotebookSection = (typeof NOTEBOOK_SECTIONS)[number]['key'];

export const NOTES_KEY = ['coach-notes'];
const SAVES_KEY = ['profile', 'coach-saves-notes'];
const SAVES_MUTATION_KEY = ['set-coach-saves-notes'];

const COLUMNS =
  'id, category, text, source, thread_id, created_at, review_on, archived_at, archive_reason';

function noteOf(
  row: Pick<
    NoteRow,
    | 'id'
    | 'category'
    | 'text'
    | 'source'
    | 'thread_id'
    | 'created_at'
    | 'review_on'
    | 'archived_at'
    | 'archive_reason'
  >,
): Note {
  return {
    id: row.id,
    category: row.category,
    text: row.text,
    source: row.source,
    threadId: row.thread_id,
    createdAt: new Date(row.created_at),
    reviewOn: row.review_on,
    archivedAt: row.archived_at ? new Date(row.archived_at) : null,
    archiveReason: row.archive_reason,
  };
}

/** The user's notes, oldest first, past ones included, but none waiting for their yes. */
export function useNotes() {
  return useQuery({
    queryKey: NOTES_KEY,
    queryFn: async (): Promise<Note[]> => {
      const { data, error } = await supabase
        .from('coach_notes')
        .select(COLUMNS)
        .eq('asked', false)
        .order('created_at')
        .order('id');
      if (error) throw error;
      return data.map(noteOf);
    },
  });
}

/** The notes in use by section, leaving out empty ones, and the past notes, last archived first. */
export function groupNotes(notes: Note[]): {
  sections: { key: NotebookSection; notes: Note[] }[];
  past: Note[];
} {
  const inUse = notes.filter((note) => !note.archivedAt);
  const sections = NOTEBOOK_SECTIONS.map(({ key, categories }) => ({
    key,
    notes: inUse.filter((note) => (categories as readonly NoteCategory[]).includes(note.category)),
  })).filter((section) => section.notes.length > 0);
  const past = notes
    .filter((note) => note.archivedAt)
    .sort((a, b) => b.archivedAt!.getTime() - a.archivedAt!.getTime());
  return { sections, past };
}

/** Why the database refused a note the user added or restored: the notebook is full. */
export type NoteRefusal = 'full' | 'kept';

/** The refusal an error means, if it is one the notebook explains. */
export function noteRefusal(error: unknown): NoteRefusal | undefined {
  const code = (error as { code?: string } | null)?.code;
  return code === 'BB046' ? 'full' : code === 'BB047' ? 'kept' : undefined;
}

/** Adds a note of the user's own, or changes one, by its id. */
export function useSaveNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      category,
      text,
    }: {
      id?: number;
      category: NoteCategory;
      text: string;
    }) => {
      const { error } =
        id === undefined
          ? await supabase.from('coach_notes').insert({ category, text: text.trim() })
          : await supabase.from('coach_notes').update({ category, text: text.trim() }).eq('id', id);
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: NOTES_KEY }),
  });
}

/** Removes a note for good, as the notebook does once its Undo has gone. */
export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: NOTES_KEY });
      queryClient.setQueryData<Note[]>(NOTES_KEY, (notes) => notes?.filter((n) => n.id !== id));
    },
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('coach_notes').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: NOTES_KEY }),
  });
}

/** Brings a past note back into use, which Bite's answers read again. */
export function useRestoreNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('coach_notes')
        .update({ archived_at: null, archive_reason: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: NOTES_KEY }),
  });
}

/** Whether Bite saves notes from chats by itself; when off, it asks first. */
export function useSavesNotes() {
  return useQuery({
    queryKey: SAVES_KEY,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('coach_saves_notes')
        .maybeSingle();
      if (error) throw error;
      return data?.coach_saves_notes ?? true;
    },
  });
}

/**
 * Switches saving notes from chats on or off. It shows at once, and is loaded again once the last
 * change is saved, so that quick changes end on the one saved last.
 */
export function useSetSavesNotes() {
  const queryClient = useQueryClient();
  const session = useSession();
  return useMutation({
    mutationKey: SAVES_MUTATION_KEY,
    mutationFn: async (saves: boolean) => {
      if (session.status !== 'ready') throw new Error('Not signed in');
      const { error } = await supabase
        .from('profiles')
        .update({ coach_saves_notes: saves })
        .eq('user_id', session.session.user.id);
      if (error) throw error;
    },
    onMutate: async (saves) => {
      await queryClient.cancelQueries({ queryKey: SAVES_KEY });
      queryClient.setQueryData(SAVES_KEY, saves);
    },
    onSettled: () =>
      queryClient.isMutating({ mutationKey: SAVES_MUTATION_KEY }) === 1
        ? queryClient.invalidateQueries({ queryKey: SAVES_KEY })
        : undefined,
  });
}
