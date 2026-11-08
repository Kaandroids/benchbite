// The work of send-deletion-code (#438, ADR 0095): emails the signed-in account a code that
// delete-account takes as proof that its owner asks.
import { refused } from '../_shared/account_refusals.ts';
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
    return refused('method_not_allowed', 405);
  }
  if (!email) {
    return refused('no_email', 400);
  }
  const body = await readJson(req, 1024);
  const locale = siteLocale((isObject(body) && body.locale) || accountLocale);

  const code = newCode();
  const hash = await codeHash(userId, code);
  const { data: answer, error } = await admin.rpc('new_account_deletion_code', {
    p_user: userId,
    p_code_hash: hash,
  });
  if (error) {
    logError('Keeping a code to delete an account failed', error);
    return refused('unavailable', 503);
  }
  if (answer !== 'sent') {
    // A code a minute, and 5 an hour.
    return refused(answer === 'too_soon' ? 'too_soon' : 'too_many_codes', 429);
  }
  try {
    await send(deletionCodeEmail(locale, email, code));
  } catch (cause) {
    logError('Sending the code to delete an account failed', cause);
    // Taken back, so that trying again sends one at once rather than wait for a code that never
    // came.
    const { error } = await admin.rpc('take_back_account_deletion_code', {
      p_user: userId,
      p_code_hash: hash,
    });
    if (error) logError('Taking back an unsent code to delete an account failed', error);
    return refused('unavailable', 503);
  }
  return Response.json({ sent: true });
}
