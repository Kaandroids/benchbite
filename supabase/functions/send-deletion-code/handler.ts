// The work of send-deletion-code (#438, ADR 0095): emails the signed-in account a code that
// delete-account takes as proof that its owner asks.
import { codeHash, newCode } from '../_shared/deletion_code.ts';
import type { Send } from '../_shared/email.ts';
import { isObject } from '../_shared/json.ts';
import { readJson } from '../_shared/request.ts';
import { siteLocale } from '../_shared/site.ts';
import { type Client, logError } from '../_shared/supabase.ts';
import { deletionCodeEmail } from './email.ts';

export type SendCodeContext = {
  /** A client with the service role, which alone keeps codes. */
  admin: Client;
  send: Send;
  /** The user the request's token belongs to. */
  userId: string;
  /** Their address; a guest has none. */
  email: string | undefined;
  /** The language the account was made in, for when the app names none. */
  accountLocale: unknown;
};

export async function handleSendCode(
  req: Request,
  { admin, send, userId, email, accountLocale }: SendCodeContext,
): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  if (!email) {
    return Response.json({ error: 'no_email' }, { status: 400 });
  }
  const body = await readJson(req, 1024);
  const locale = siteLocale((isObject(body) && body.locale) || accountLocale);

  const code = newCode();
  const { data: answer, error } = await admin.rpc('new_account_deletion_code', {
    p_user: userId,
    p_code_hash: await codeHash(userId, code),
  });
  if (error) {
    logError('Keeping a code to delete an account failed', error);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
  if (answer !== 'sent') {
    // A code a minute, and 5 an hour.
    return Response.json(
      { error: answer === 'too_soon' ? 'too_soon' : 'too_many_codes' },
      {
        status: 429,
      },
    );
  }
  try {
    await send(deletionCodeEmail(locale, email, code));
  } catch (cause) {
    logError('Sending the code to delete an account failed', cause);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
  return Response.json({ sent: true });
}
