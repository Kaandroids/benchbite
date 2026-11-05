// The work of delete-account (#134, ADR 0087), apart from signing in, so that it can be tested with
// a stand-in for storage and auth. The user's rows go with the user through their foreign keys, and
// the photos of their chats through the queue of ADR 0063. Their exercise photos go first: if that
// fails nothing else has changed, and nothing could name those files once the user is gone.
import { emptyFolder } from '../_shared/storage.ts';
import { type Client, logError } from '../_shared/supabase.ts';

/** The private bucket of the photos users add to their own exercises, in "<user id>/". */
export const EXERCISE_PHOTOS_BUCKET = 'exercise-photos';

export type DeleteContext = {
  /** A client with the service role, which alone deletes users. */
  admin: Client;
  /** The user the request's token belongs to, the only one it may delete. */
  userId: string;
};

export async function handleDeleteRequest(req: Request, context: DeleteContext): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  const { admin, userId } = context;

  try {
    await emptyFolder(admin, EXERCISE_PHOTOS_BUCKET, userId);
  } catch (cause) {
    logError('Removing the exercise photos of a user being deleted failed', cause);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  // Already gone, as when an earlier try's answer was lost: what was asked for is done.
  if (error && error.status !== 404) {
    logError('Deleting a user failed', error);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
  return Response.json({ deleted: true });
}
