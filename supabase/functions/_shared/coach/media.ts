// Where the photos of a chat are kept (ADR 0062), shared by the functions that write and remove
// them, so that they agree. This file imports nothing, so that the app can bundle it.

/** The private bucket that holds the photos sent to Bite. */
export const MEDIA_BUCKET = 'coach-media';

/** The folder of a thread's photos, "<user id>/<thread id>", which holds photos only. */
export function threadMediaFolder(userId: string, threadId: number): string {
  return `${userId}/${threadId}`;
}
