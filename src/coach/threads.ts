// Bite's chat history (#295, ADR 0055): the user's threads, a page at a time, the messages of one,
// and renaming and deleting a thread. Threads and messages are written only by the chat function
// (ADR 0050); the user reads, renames and deletes them under row level security.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Json } from '@/lib/database.types';
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
    getNextPageParam: (page): Cursor | undefined => {
      const last = page.at(-1);
      return page.length === PAGE_SIZE && last
        ? { at: last.last_message_at, id: last.id }
        : undefined;
    },
    select: (data) =>
      data.pages.flat().map((row): ThreadSummary => ({
        id: row.id,
        title: row.title,
        lastMessageAt: new Date(row.last_message_at),
        lastMessage: row.last_message,
        expression: row.expression,
      })),
  });
}

/** The text of a stored message: its text parts, in order, one after the other. */
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
        messages: data.map((row, index): ChatMessage & { createdAt: Date } => ({
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

/** Renames a thread; an empty name clears it. */
export function useRenameThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: { id: number; title: string }) => {
      const name = title.trim().slice(0, MAX_THREAD_TITLE_LENGTH);
      const { error } = await supabase
        .from('coach_threads')
        .update({ title: name || null })
        .eq('id', id);
      if (error) {
        throw error;
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: THREADS_KEY }),
  });
}

/** Deletes a thread with its messages (ADR 0050). */
export function useDeleteThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('coach_threads').delete().eq('id', id);
      if (error) {
        throw error;
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: THREADS_KEY }),
  });
}
