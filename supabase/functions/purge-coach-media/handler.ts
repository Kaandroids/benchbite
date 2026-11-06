// The work of purge-coach-media (#361, ADR 0063), apart from signing in, so that it can be tested
// with a stand-in for the database and storage. It takes a batch of the folders that deleted
// chats left in coach-media, removes their files, photos and voice messages, and then their place
// in the queue. A folder that fails stays queued for the next run.
import { MEDIA_BUCKET, threadMediaFolder } from '../_shared/coach/media.ts';
import { emptyFolder } from '../_shared/storage.ts';
import { type Client, logError } from '../_shared/supabase.ts';

/** Folders per run: a run has to end well within the scheduled call's timeout. */
export const BATCH_SIZE = 20;

export type PurgeContext = {
  /** A client with the service role, which alone reads the queue and removes the files. */
  admin: Client;
};

export type PurgeResult = { purged: number; failed: number };

type Queued = { thread_id: number; user_id: string; attempts: number };

export async function handlePurgeRequest(req: Request, context: PurgeContext): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  const { admin } = context;

  // Folders that keep failing go last, so that they cannot hold up the others.
  const { data: queued, error } = await admin
    .from('coach_media_deletions')
    .select('thread_id, user_id, attempts')
    .order('attempts')
    .order('queued_at')
    .limit(BATCH_SIZE);
  if (error) {
    logError('Reading the queue failed', error);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }

  const purged: number[] = [];
  const failed: Queued[] = [];
  for (const folder of queued as Queued[]) {
    try {
      await emptyFolder(admin, MEDIA_BUCKET, threadMediaFolder(folder.user_id, folder.thread_id));
      purged.push(folder.thread_id);
    } catch (cause) {
      // The thread id alone: the path also names the user.
      logError(`Purging the files of thread ${folder.thread_id} failed`, cause);
      failed.push(folder);
    }
  }

  if (purged.length > 0) {
    const { error } = await admin.from('coach_media_deletions').delete().in('thread_id', purged);
    // The folders are empty, so the next run finds nothing in them and removes them again.
    if (error) logError('Removing purged folders from the queue failed', error);
  }
  for (const folder of failed) {
    const { error } = await admin
      .from('coach_media_deletions')
      .update({ attempts: folder.attempts + 1 })
      .eq('thread_id', folder.thread_id);
    if (error) logError('Counting a failed purge failed', error);
  }

  const result: PurgeResult = { purged: purged.length, failed: failed.length };
  return Response.json(result);
}
