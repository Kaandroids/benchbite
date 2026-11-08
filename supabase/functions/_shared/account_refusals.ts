// Why the account's Edge Functions refuse (ADR 0095), as they answer `{ error }`. The app tells
// the user by these, so a new or renamed one fails its typecheck until it says what it means.

export type AccountRefusal =
  | 'method_not_allowed'
  | 'unavailable'
  | 'no_email'
  | 'too_soon'
  | 'too_many_codes'
  | 'proof_required'
  | 'wrong_code'
  | 'code_expired'
  | 'wrong_password'
  | 'password_recently_changed'
  | 'too_many_tries'
  | 'busy';

/** The answer that refuses, with why. */
export function refused(reason: AccountRefusal, status: number): Response {
  return Response.json({ error: reason }, { status });
}
