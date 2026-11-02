// The files of a message to Bite, its photos (ADR 0062) and its voice message (ADR 0072): kept in
// `coach-media` with the service role, in its thread's folder, each under a new name.
import { MEDIA_BUCKET, threadMediaFolder } from '../_shared/coach/media.ts';
import { type Client, logError } from '../_shared/supabase.ts';

/** What the bucket takes, and the name each is kept under. */
const EXTENSIONS = { 'image/jpeg': 'jpg', 'audio/mp4': 'm4a' } as const;

/**
 * Keeps a file of a message in its thread's folder under a new name, and gives its path, or nothing
 * when it could not be kept. The bucket refuses what it does not take, or what is too large.
 */
export async function keepFile(
  admin: Client,
  userId: string,
  threadId: number,
  bytes: Uint8Array,
  contentType: keyof typeof EXTENSIONS,
): Promise<string | undefined> {
  const path = `${threadMediaFolder(userId, threadId)}/${crypto.randomUUID()}.${EXTENSIONS[contentType]}`;
  const { error } = await admin.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) return void logError(`Could not keep a file of a message (${contentType})`, error);
  return path;
}

/**
 * Removes kept photos and voice messages whose message could not be saved, as nothing else would.
 */
export async function removeMedia(admin: Client, parts: { path: string }[]): Promise<void> {
  if (!parts.length) return;
  const { error } = await admin.storage.from(MEDIA_BUCKET).remove(parts.map((part) => part.path));
  if (error) logError('Could not remove the media of a message not saved', error);
}
