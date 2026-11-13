// The work of send-deletion-code (#438, ADR 0095): emails the signed-in account a code that
// delete-account takes as proof that its owner asks.
import { refused } from '../_shared/account_refusals.ts';
import { codeHash, newCode } from '../_shared/deletion_code.ts';
import type { Send } from '../_shared/email.ts';
import { isObject } from '../_shared/json.ts';
import { readJson } from '../_shared/request.ts';
import { siteLocale } from '../_shared/site.ts';
import { storedUser } from '../_shared/stored_user.ts';
import { type Client, logError } from '../_shared/supabase.ts';
import { deletionCodeEmail } from './email.ts';

export type SendCodeContext = {
  /** A client with the service role, which alone keeps codes. */
  admin: Client;
  send: Send;
  /**
   * The user the request's token belongs to; their address, and the language the account was made
   * in, are read as stored, so that a code never goes to an address changed since (#528).
   */
  userId: string;
};

export async function handleSendCode(
  req: Request,
  { admin, send, userId }: SendCodeContext,
): Promise<Response> {
  if (req.method !== 'POST') {
    return refused('method_not_allowed', 405);
  }
  const user = await storedUser(admin, userId);
  if (!user) return refused('unavailable', 503);
  if (user.gone || !user.email) {
    return refused('no_email', 400);
  }
  const { email } = user;
  const body = await readJson(req, 1024);
  const locale = siteLocale((isObject(body) && body.locale) || user.locale);

  const code = newCode();
  const hash = await codeHash(userId, code);
  // The code keeps the address it is mailed to, and works only while that is still the account's,
  // so one mailed to an address that changes meanwhile deletes nothing (#563).
  const { data: answer, error } = await admin.rpc('new_account_deletion_code', {
    p_user: userId,
    p_code_hash: hash,
    p_email: email,
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
