// The work of remove-inactive-guests (#535, ADR 0131), apart from signing in, so that it can be
// tested with a stand-in for the database, storage and auth. It takes a batch of the guests
// inactive for 90 days and deletes each as deleting an account does. A guest that fails is left
// for a later run.
import { deleteUser } from '../_shared/delete_user.ts';
import { type Client, logError } from '../_shared/supabase.ts';

/** Guests per run: a run has to end well within the scheduled call's timeout. */
export const BATCH_SIZE = 20;

export type RemovalContext = {
  /** A client with the service role, which alone finds the guests and deletes them. */
  admin: Client;
};

export type RemovalResult = { removed: number; failed: number };

export async function handleRemovalRequest(
  req: Request,
  context: RemovalContext,
): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  const { admin } = context;

  const { data: guests, error } = await admin.rpc('inactive_guests', { p_limit: BATCH_SIZE });
  if (error) {
    logError('Finding inactive guests failed', error);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }

  const result: RemovalResult = { removed: 0, failed: 0 };
  for (const guest of guests) {
    // deleteUser logs why it failed.
    if (await deleteUser(admin, guest)) result.removed++;
    else result.failed++;
  }
  return Response.json(result);
}
