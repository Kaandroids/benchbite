// The work of delete-account (#134, ADR 0087), apart from reading the token, so that it can be
// tested with a stand-in for storage and auth. An account must prove its owner asks, with a code
// from send-deletion-code or by signing in with its password just before (#438, ADR 0095, ADR
// 0127); a guest has neither, and needs no proof.
import { type AccountRefusal, refused } from '../_shared/account_refusals.ts';
import { codeHash, isCode } from '../_shared/deletion_code.ts';
import { deleteUser } from '../_shared/delete_user.ts';
import { isObject } from '../_shared/json.ts';
import { readJson } from '../_shared/request.ts';
import { storedUser } from '../_shared/stored_user.ts';
import { type Client, logError } from '../_shared/supabase.ts';

/**
 * How long a sign-in with the password proves its owner asks, in seconds. The app signs in just
 * before it calls the function, so a minute is enough; any sign-in counts, an ordinary one too, so
 * a longer time would only give whoever takes the session after it more.
 */
const PASSWORD_SIGN_IN_PROVES_FOR = 60;

export type DeleteContext = {
  /** A client with the service role, which alone deletes users. */
  admin: Client;
  /**
   * The user the request's token belongs to, the only one it may delete. Whether they are a guest,
   * and their address, are read as stored, not from the token (#528).
   */
  userId: string;
  /**
   * When the token's session signed in with the password, in seconds since 1970, if it did. Auth
   * keeps the time of the sign-in as the token is refreshed, so a later token does not make it new.
   */
  passwordSignInAt: number | undefined;
};

/** When the token's claims say its session signed in with a password, from their `amr`. */
export function passwordSignInFromClaims(
  claims: Record<string, unknown> | null,
): number | undefined {
  const methods = claims?.amr;
  if (!Array.isArray(methods)) return undefined;
  const password = methods.find((method) => isObject(method) && method.method === 'password');
  return typeof password?.timestamp === 'number' ? password.timestamp : undefined;
}

/** The answers to a code that is not right, by what check_account_deletion_code said. */
const CODE_REFUSED: Record<string, [AccountRefusal, number]> = {
  wrong: ['wrong_code', 403],
  expired: ['code_expired', 410],
  too_many: ['too_many_tries', 429],
};

const unavailable = () => refused('unavailable', 503);

/** Why the request does not prove the owner of the account asks, or nothing when it does. */
async function proofRefused(
  body: unknown,
  { admin, userId, passwordSignInAt }: DeleteContext,
): Promise<Response | undefined> {
  const { code, signedIn } = isObject(body) ? body : {};

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

  // Auth checked the password as the app signed in with it, from the phone's IP, which Auth
  // limits; the function's IP is everyone's, so tries made from here would share one limit (#531).
  if (signedIn === true && passwordSignInAt !== undefined) {
    if (Date.now() / 1000 - passwordSignInAt > PASSWORD_SIGN_IN_PROVES_FOR) {
      return refused('proof_required', 400);
    }
    const { data: changedLately, error } = await admin.rpc('password_changed_lately', {
      p_user: userId,
    });
    if (error) {
      logError('Asking whether a password changed lately failed', error);
      return unavailable();
    }
    return changedLately ? refused('password_recently_changed', 403) : undefined;
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
    const refusal = await proofRefused(await readJson(req, 4096), context);
    if (refusal) return refusal;
  }
  if (!(await deleteUser(context.admin, context.userId))) {
    return unavailable();
  }
  return Response.json({ deleted: true });
}
