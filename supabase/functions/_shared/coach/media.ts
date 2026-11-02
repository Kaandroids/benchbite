// Where the photos (ADR 0062) and voice messages (ADR 0072) of a chat are kept, shared by the
// functions that write and remove them, so that they agree. This file imports nothing, so that the app can bundle it.

/** The private bucket that holds the photos and voice messages sent to Bite. */
export const MEDIA_BUCKET = 'coach-media';

/**
 * The folder of a thread's photos and voice messages, "<user id>/<thread id>", which holds those
 * files only, no folders.
 */
export function threadMediaFolder(userId: string, threadId: number): string {
  return `${userId}/${threadId}`;
}
