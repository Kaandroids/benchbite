// The addresses of the photos (ADR 0062) and voice messages (ADR 0073) a chat with Bite keeps in
// `coach-media`, read when the chat is opened again.
import { MEDIA_BUCKET } from '@shared/coach/media';
import { useQueries } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import type { ChatMessage } from './use-chat';

/**
 * How long an address lasts. The addresses are kept in the query cache alone, by chat,
 * with one policy that never shows one that has ended: while the chat is open they are asked for
 * again every half of that, as when it opens once half of it has passed, and they are kept for
 * less than the other half after it closes. A chat opened again soon shows its photos at the same
 * addresses, which the image cache keeps them by, without asking for them again.
 */
const SIGNED_MS = 60 * 60 * 1000;
const RENEW_MS = SIGNED_MS / 2;
const KEPT_AFTER_CLOSE_MS = RENEW_MS - 5 * 60 * 1000;

/**
 * Short-lived addresses of photos and voice messages in `coach-media`, by path, which the user may
 * read under the bucket's policies (ADR 0062), asked for in one request.
 */
export async function mediaUrls(paths: string[]): Promise<Map<string, string>> {
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls([...new Set(paths)], SIGNED_MS / 1000);
  if (error) throw error;
  return new Map(
    data.flatMap(({ path, signedUrl }) => (path && signedUrl ? [[path, signedUrl]] : [])),
  );
}

/** The paths of the photos and voice messages kept with `messages`, in order. */
export function mediaPaths(messages: ChatMessage[]): string[] {
  return messages.flatMap((message) => [
    ...(message.photos ?? []).flatMap((photo) => (photo.path ? [photo.path] : [])),
    ...(message.voice?.path ? [message.voice.path] : []),
  ]);
}

/**
 * The addresses of the photos and voice messages a chat keeps, by path, read a page of messages at
 * a time: those it opened with, then each page of older ones as it is read (#544). A page read
 * later asks only for its own, and the addresses read before stay while it is asked for.
 */
export function useMediaUrls(threadId: number | undefined, pages: string[][]) {
  return useQueries({
    queries: pages.map((paths) => ({
      queryKey: ['coach-media', threadId, paths],
      enabled: paths.length > 0,
      queryFn: () => mediaUrls(paths),
      staleTime: RENEW_MS,
      refetchInterval: RENEW_MS,
      gcTime: KEPT_AFTER_CLOSE_MS,
    })),
    combine: byPath,
  });
}

/**
 * The addresses of every page read so far, in one map. A function of its own, the same each
 * render, so that the map is made again only when an answer changes.
 */
function byPath(results: { data?: Map<string, string> }[]) {
  return results.some((result) => result.data)
    ? new Map(results.flatMap((result) => [...(result.data ?? [])]))
    : undefined;
}
