// Deleting a user and all that is theirs (#134, ADR 0087), from the app or from the website's link
// (ADR 0094). The user's rows go with the user through their foreign keys, and the photos of their
// chats through the queue of ADR 0063. Their exercise photos go first: if that fails nothing else
// has changed, and nothing could name those files once the user is gone.
import { EXERCISE_PHOTOS_BUCKET } from './exercise_photos.ts';
import { emptyFolder } from './storage.ts';
import { type Client, logError } from './supabase.ts';

/** Deletes the user, with a client of the service role; false when it could not, and nothing went. */
export async function deleteUser(admin: Client, userId: string): Promise<boolean> {
  try {
    await emptyFolder(admin, EXERCISE_PHOTOS_BUCKET, userId);
  } catch (cause) {
    logError('Removing the exercise photos of a user being deleted failed', cause);
    return false;
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  // Already gone, as when an earlier try's answer was lost: what was asked for is done.
  if (error && error.status !== 404) {
    logError('Deleting a user failed', error);
    return false;
  }
  // Once more, for a photo another device uploaded in between. The user is gone, so this can only
  // be logged.
  try {
    await emptyFolder(admin, EXERCISE_PHOTOS_BUCKET, userId);
  } catch (cause) {
    logError('Removing the exercise photos of a deleted user failed', cause);
  }
  return true;
}
