// The work of send-password-email (#481, ADR 0167): emails a user whose password was just saved,
// to their address as Auth stores it, in the language the account was made in.
import type { Send } from '../_shared/email.ts';
import { isObject } from '../_shared/json.ts';
import { readJson } from '../_shared/request.ts';
import { siteLocale } from '../_shared/site.ts';
import { storedUser } from '../_shared/stored_user.ts';
import { type Client, logError } from '../_shared/supabase.ts';
import { type PasswordEmailKind, passwordEmail } from './email.ts';

export type PasswordEmailContext = {
  /** A client with the service role, which reads the user's address. */
  admin: Client;
  send: Send;
};

const KINDS: readonly PasswordEmailKind[] = ['welcome', 'changed'];

export async function handlePasswordEmail(
  req: Request,
  { admin, send }: PasswordEmailContext,
): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  const body = await readJson(req, 1024);
  const userId = isObject(body) && typeof body.userId === 'string' ? body.userId : undefined;
  const kind = isObject(body) ? KINDS.find((known) => known === body.kind) : undefined;
  if (!userId || !kind) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }
  const user = await storedUser(admin, userId);
  if (!user) return Response.json({ error: 'unavailable' }, { status: 503 });
  // Deleted meanwhile, or a guest: nobody to tell.
  if (user.gone || !user.email) return Response.json({ sent: false });
  try {
    await send(passwordEmail(kind, siteLocale(user.locale), user.email));
  } catch (cause) {
    logError('Sending the password email failed', cause);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
  return Response.json({ sent: true });
}
