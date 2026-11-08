// The work of delete-account (#134, ADR 0087), apart from signing in, so that it can be tested with
// a stand-in for storage and auth. An account must prove its owner asks, with a code from
// send-deletion-code or its password (#438, ADR 0095); a guest has neither, and needs no proof.
import { codeHash, CODE_LENGTH } from '../_shared/deletion_code.ts';
import { deleteUser } from '../_shared/delete_user.ts';
import { isObject } from '../_shared/json.ts';
import { readJson } from '../_shared/request.ts';
import { type Client, logError } from '../_shared/supabase.ts';

export type DeleteContext = {
  /** A client with the service role, which alone deletes users. */
  admin: Client;
  /** The user the request's token belongs to, the only one it may delete. */
  userId: string;
  /** Whether that user is a guest. */
  guest: boolean;
  /** Their address; a guest has none. */
  email: string | undefined;
  /** Whether the password is the account's, by signing in with it; throws when Auth fails. */
  checkPassword: (email: string, password: string) => Promise<boolean>;
};

const CODE = new RegExp(`^\\d{${CODE_LENGTH}}$`);

const refused = (error: string, status: number) => Response.json({ error }, { status });

/** Why the request does not prove the owner of the account asks, or nothing when it does. */
async function proofRefused(
  body: unknown,
  { admin, userId, email, checkPassword }: DeleteContext,
): Promise<Response | undefined> {
  const { code, password } = isObject(body) ? body : {};

  if (typeof code === 'string' && CODE.test(code)) {
    const { data: right, error } = await admin.rpc('check_account_deletion_code', {
      p_user: userId,
      p_code_hash: await codeHash(userId, code),
    });
    if (error) {
      logError('Checking a code to delete an account failed', error);
      return refused('unavailable', 503);
    }
    return right ? undefined : refused('wrong_code', 403);
  }

  if (typeof password === 'string' && password && email) {
    const { data: allowed, error } = await admin.rpc('take_account_deletion_password_try', {
      p_user: userId,
    });
    if (error) {
      logError('Counting a password try to delete an account failed', error);
      return refused('unavailable', 503);
    }
    if (!allowed) {
      return refused('too_many_tries', 429);
    }
    try {
      return (await checkPassword(email, password)) ? undefined : refused('wrong_password', 403);
    } catch (cause) {
      logError('Checking the password to delete an account failed', cause);
      return refused('unavailable', 503);
    }
  }

  return refused('proof_required', 400);
}

export async function handleDeleteRequest(req: Request, context: DeleteContext): Promise<Response> {
  if (req.method !== 'POST') {
    return refused('method_not_allowed', 405);
  }
  if (!context.guest) {
    const refusal = await proofRefused(await readJson(req, 4096), context);
    if (refusal) return refusal;
  }
  if (!(await deleteUser(context.admin, context.userId))) {
    return refused('unavailable', 503);
  }
  return Response.json({ deleted: true });
}
