// The work of delete-account (#134, ADR 0087), apart from signing in, so that it can be tested with
// a stand-in for storage and auth.
import { deleteUser } from '../_shared/delete_user.ts';
import type { Client } from '../_shared/supabase.ts';

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
  if (!(await deleteUser(context.admin, context.userId))) {
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
  return Response.json({ deleted: true });
}
