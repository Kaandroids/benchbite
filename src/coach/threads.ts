// Bite's chat history (#295, ADR 0055): the user's threads, a page at a time, the messages of one,
// and renaming and deleting a thread. Threads and messages are written only by the chat function
// (ADR 0050); the user reads, renames and deletes them under row level security.
import {
  type InfiniteData,
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type { Database, Json } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

import type { AnswerExpression } from './bite-expressions';
import type { ChatMessage } from './use-chat';

export const THREADS_KEY = ['coach-threads'];

/** How many threads `my_coach_threads()` gives at a time. */
const PAGE_SIZE = 50;

/** The longest name a thread may have, as `coach_threads.title` keeps it. */
export const MAX_THREAD_TITLE_LENGTH = 120;

export type ThreadSummary = {
  id: number;
  /** Null when the user cleared it. */
  title: string | null;
  lastMessageAt: Date;
  /** The last message's text, cut for a line; null for one without text. */
  lastMessage: string | null;
  /** The face of Bite's last answer, if it answered. */
  expression: AnswerExpression | null;
};

type Cursor = { at: string; id: number };

/** A row of `my_coach_threads()` as the app reads it. */
function toSummary(
  row: Database['public']['Functions']['my_coach_threads']['Returns'][number],
): ThreadSummary {
  return {
    id: row.id,
    title: row.title,
    lastMessageAt: new Date(row.last_message_at),
    lastMessage: row.last_message,
    expression: row.expression,
  };
}

/** The user's threads, latest first, a page at a time, found by `search` when it is given. */
export function useThreads(search: string) {
  const term = search.trim();
  return useInfiniteQuery({
    queryKey: [...THREADS_KEY, 'list', term],
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('my_coach_threads', {
        ...(term && { search: term }),
        ...(pageParam && { before_at: pageParam.at, before_id: pageParam.id }),
      });
      if (error) {
        throw error;
      }
      return data;
    },
    initialPageParam: undefined as Cursor | undefined,
    // The last list stays while a new search loads, so the screen does not empty as one types.
    placeholderData: keepPreviousData,
    getNextPageParam: (page): Cursor | undefined => {
      const last = page.at(-1);
      return page.length === PAGE_SIZE && last
        ? { at: last.last_message_at, id: last.id }
        : undefined;
    },
    select: (data) => data.pages.flat().map(toSummary),
  });
}

/**
 * The text of a stored message: its text parts, in order, one after the other. The chat function
 * (toMessage() in supabase/functions/coach-chat/handler.ts) and the history (coach_message_text()
 * in the chat_history migration) read the same parts.
 */
export function messageText(content: Json): string {
  const parts = Array.isArray(content) ? content : [];
  return parts
    .flatMap((part) =>
      part &&
      typeof part === 'object' &&
      !Array.isArray(part) &&
      part.type === 'text' &&
      typeof part.text === 'string'
        ? [part.text]
        : [],
    )
    .join('\n');
}

/**
 * A thread's name and its messages as the chat shows them, oldest first; null for a thread that is
 * gone. A question no answer of Bite's
 * followed, as one that failed, is shown as not answered, to ask again.
 */
export function useThreadMessages(threadId: number | undefined) {
  return useQuery({
    queryKey: [...THREADS_KEY, 'messages', threadId],
    enabled: threadId !== undefined,
    // Always read again when a chat opens: an answer may have been saved after it closed.
    staleTime: 0,
    queryFn: async () => {
      const [thread, messages] = await Promise.all([
        supabase.from('coach_threads').select('title').eq('id', threadId!).maybeSingle(),
        supabase
          .from('coach_messages')
          .select('id, role, content, expression, created_at')
          .eq('thread_id', threadId!)
          .order('id'),
      ]);
      if (thread.error) {
        throw thread.error;
      }
      if (messages.error) {
        throw messages.error;
      }
      // Gone, as when it was deleted elsewhere: the chat starts a new one.
      if (!thread.data) {
        return null;
      }
      const data = messages.data;
      return {
        title: thread.data.title,
        messages: data.map((row, index): ChatMessage => ({
          id: `stored-${row.id}`,
          role: row.role,
          text: messageText(row.content),
          expression: row.expression ?? undefined,
          createdAt: new Date(row.created_at),
          ...(row.role === 'user' && data[index + 1]?.role !== 'bite' && { unanswered: true }),
        })),
      };
    },
  });
}

/** A name as it is kept: without spaces around it, within its length; null when empty. */
export function threadTitle(text: string): string | null {
  return text.trim().slice(0, MAX_THREAD_TITLE_LENGTH) || null;
}

/** How long after its last message Bite opens on a thread again, rather than a new one. */
const RECENT_MS = 6 * 60 * 60 * 1000;

/**
 * The user's latest chat, which Bite opens on while it is recent (ADR 0055), and otherwise offers
 * to continue; null without one. Read only when `wanted`.
 */
export function useLastThread(wanted: boolean) {
  return useQuery({
    queryKey: [...THREADS_KEY, 'last'],
    enabled: wanted,
    staleTime: 0,
    // Read once as Bite opens, which decides on it; never again under the open chat.
    refetchOnWindowFocus: false,
    // Bite waits for it before it shows; one that fails opens a new chat at once, not after tries.
    retry: false,
    queryFn: async (): Promise<ThreadSummary | null> => {
      const { data, error } = await supabase.rpc('my_coach_threads', { page_size: 1 });
      if (error) {
        throw error;
      }
      return data[0] ? toSummary(data[0]) : null;
    },
  });
}

/** Whether a chat is recent enough for Bite to open on it again. */
export function isRecent(thread: ThreadSummary, now: Date): boolean {
  return now.getTime() - thread.lastMessageAt.getTime() < RECENT_MS;
}

/** Renames a thread; an empty name clears it. */
export function useRenameThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: { id: number; title: string }) => {
      const { error } = await supabase
        .from('coach_threads')
        .update({ title: threadTitle(title) })
        .eq('id', id);
      if (error) {
        throw error;
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: THREADS_KEY }),
  });
}

/** Deletes a thread with its messages (ADR 0050); it leaves the lists at once. */
export function useDeleteThread() {
  const queryClient = useQueryClient();
  return useMutation({
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: [...THREADS_KEY, 'list'] });
      queryClient.setQueriesData<InfiniteData<{ id: number }[]>>(
        { queryKey: [...THREADS_KEY, 'list'] },
        (data) =>
          data && { ...data, pages: data.pages.map((page) => page.filter((row) => row.id !== id)) },
      );
    },
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('coach_threads').delete().eq('id', id);
      if (error) {
        throw error;
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: THREADS_KEY }),
  });
}
