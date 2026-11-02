// The addresses of the photos (ADR 0062) and voice messages (ADR 0073) a chat with Bite keeps in
// `coach-media`, read when the chat is opened again.
import { MEDIA_BUCKET } from '@shared/coach/media';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

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

/** The addresses of the photos and voice messages a chat keeps, read once as it opens. */
export function useMediaUrls(threadId: number | undefined, paths: string[]) {
  return useQuery({
    queryKey: ['coach-media', threadId, paths],
    enabled: paths.length > 0,
    queryFn: () => mediaUrls(paths),
    staleTime: RENEW_MS,
    refetchInterval: RENEW_MS,
    gcTime: KEPT_AFTER_CLOSE_MS,
  });
}
