// The work of expire-coach-media (#728, ADR 0170): removes the photos and voice messages sent more
// than 30 days ago, from chats that go on, and then marks them removed in their messages. A file
// already gone is marked all the same; if storage fails, nothing is marked and the next run tries
// again. A pg_cron job calls it while there are any.
import { MEDIA_BUCKET } from '../_shared/coach/media.ts';
import { type Client, logError } from '../_shared/supabase.ts';

/** Messages a run takes: their files are removed in one request, well within the call's time. */
export const BATCH_SIZE = 200;

export async function handleExpireMedia(req: Request, admin: Client): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  const { data: expiring, error } = await admin.rpc('expiring_coach_media', {
    p_limit: BATCH_SIZE,
  });
  if (error) {
    logError('Finding the media to expire failed', error);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
  if (expiring.length === 0) return Response.json({ expired: 0 });

  const { error: removeError } = await admin.storage
    .from(MEDIA_BUCKET)
    .remove(expiring.map((row) => row.path));
  if (removeError) {
    logError('Removing expired media failed', removeError);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
  const messages = [...new Set(expiring.map((row) => row.message_id))];
  const { error: forgetError } = await admin.rpc('forget_coach_media', {
    p_message_ids: messages,
  });
  if (forgetError) {
    // The files are gone; the next run finds the paths again, removes nothing and marks them.
    logError('Marking expired media removed failed', forgetError);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
  return Response.json({ expired: expiring.length });
}
