// The work of delete-account (#134, ADR 0087), apart from signing in, so that it can be tested with
// a stand-in for storage and auth. An account must prove its owner asks, with a code from
// send-deletion-code or its password (#438, ADR 0095); a guest has neither, and needs no proof.
import { type AccountRefusal, refused } from '../_shared/account_refusals.ts';
import { codeHash, isCode } from '../_shared/deletion_code.ts';
import { deleteUser } from '../_shared/delete_user.ts';
import { isObject } from '../_shared/json.ts';
import { readJson } from '../_shared/request.ts';
import { storedUser } from '../_shared/stored_user.ts';
import { type Client, logError } from '../_shared/supabase.ts';

/** What signing in with a password said: right, wrong, or that Auth takes no more tries for now. */
export type PasswordCheck = 'right' | 'wrong' | 'busy';

export type DeleteContext = {
  /** A client with the service role, which alone deletes users. */
  admin: Client;
  /**
   * The user the request's token belongs to, the only one it may delete. Whether they are a guest,
   * and their address, are read as stored, not from the token (#528).
   */
  userId: string;
  /** Checks the password by signing in with it; throws when Auth fails. */
  checkPassword: (email: string, password: string) => Promise<PasswordCheck>;
};

/** The answers to a code that is not right, by what check_account_deletion_code said. */
const CODE_REFUSED: Record<string, [AccountRefusal, number]> = {
  wrong: ['wrong_code', 403],
  expired: ['code_expired', 410],
  too_many: ['too_many_tries', 429],
};

/** The answers to a password that may not be tried, by what take_account_deletion_password_try said. */
const PASSWORD_REFUSED: Record<string, [AccountRefusal, number]> = {
  recently_changed: ['password_recently_changed', 403],
  too_many: ['too_many_tries', 429],
  busy: ['busy', 429],
};

const unavailable = () => refused('unavailable', 503);

/** Why the request does not prove the owner of the account asks, or nothing when it does. */
async function proofRefused(
  body: unknown,
  email: string | undefined,
  { admin, userId, checkPassword }: DeleteContext,
): Promise<Response | undefined> {
  const { code, password } = isObject(body) ? body : {};

  if (isCode(code)) {
    const { data: answer, error } = await admin.rpc('check_account_deletion_code', {
      p_user: userId,
      p_code_hash: await codeHash(userId, code),
    });
    if (error) {
      logError('Checking a code to delete an account failed', error);
      return unavailable();
    }
    if (answer === 'right') return undefined;
    const [refusal, status] = CODE_REFUSED[answer] ?? ['wrong_code', 403];
    return refused(refusal, status);
  }

  if (typeof password === 'string' && password && email) {
    const { data: answer, error } = await admin.rpc('take_account_deletion_password_try', {
      p_user: userId,
    });
    if (error) {
      logError('Counting a password try to delete an account failed', error);
      return unavailable();
    }
    if (answer !== 'allowed') {
      const [refusal, status] = PASSWORD_REFUSED[answer] ?? ['busy', 429];
      return refused(refusal, status);
    }
    try {
      const check = await checkPassword(email, password);
      if (check === 'right') return undefined;
      return check === 'busy' ? refused('busy', 429) : refused('wrong_password', 403);
    } catch (cause) {
      logError('Checking the password to delete an account failed', cause);
      return unavailable();
    }
  }

  return refused('proof_required', 400);
}

export async function handleDeleteRequest(req: Request, context: DeleteContext): Promise<Response> {
  if (req.method !== 'POST') {
    return refused('method_not_allowed', 405);
  }
  const user = await storedUser(context.admin, context.userId);
  if (!user) return unavailable();
  // Deleted already, as when the answer to a try that deleted it was lost: what was asked for is
  // done, and its code went with it, so no proof could be checked.
  if (user.gone) {
    return Response.json({ deleted: true });
  }
  if (!user.guest) {
    const refusal = await proofRefused(await readJson(req, 4096), user.email, context);
    if (refusal) return refusal;
  }
  if (!(await deleteUser(context.admin, context.userId))) {
    return unavailable();
  }
  return Response.json({ deleted: true });
}
