// The work of remove-inactive-guests (#535, ADR 0131), apart from signing in, so that it can be
// tested with a stand-in for the database, storage and auth. It deletes the guests inactive for 90
// days as deleting an account does, a batch at a time, until none are left or its time is up. A
// guest that fails is left for a later run.
import { deleteUser } from '../_shared/delete_user.ts';
import { type Client, logError } from '../_shared/supabase.ts';

/** Guests asked for at a time. */
export const BATCH_SIZE = 20;

/** No batch starts after this: a run has to end well within the scheduled call's 60 s timeout. */
export const TIME_BUDGET_MS = 40_000;

export type RemovalContext = {
  /** A client with the service role, which alone finds the guests and deletes them. */
  admin: Client;
  /** Milliseconds now, for the time budget. */
  now?: () => number;
};

export type RemovalResult = { removed: number; failed: number };

export async function handleRemovalRequest(
  req: Request,
  context: RemovalContext,
): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  const { admin, now = Date.now } = context;
  const deadline = now() + TIME_BUDGET_MS;

  const result: RemovalResult = { removed: 0, failed: 0 };
  while (now() < deadline) {
    const { data: guests, error } = await admin.rpc('inactive_guests', { p_limit: BATCH_SIZE });
    if (error) {
      logError('Finding inactive guests failed', error);
      // What this run removed stays removed; the next run goes on.
      if (result.removed + result.failed > 0) break;
      return Response.json({ error: 'unavailable' }, { status: 503 });
    }

    let removed = 0;
    for (const guest of guests) {
      // deleteUser logs why it failed.
      if (await deleteUser(admin, guest)) removed++;
      else result.failed++;
    }
    result.removed += removed;
    // A short batch was the last, and one with none removed holds only guests that keep failing,
    // which the next run tries again.
    if (guests.length < BATCH_SIZE || removed === 0) break;
  }
  return Response.json(result);
}
