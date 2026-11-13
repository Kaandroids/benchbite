// The signed-in user as Auth stores them now, for what the token's claims may no longer say: a
// token stays valid for up to an hour, so one issued while the user was a guest still says so
// after they made an account, and one issued before an email change names the old address (#528).
import { type Client, logError } from './supabase.ts';

export type StoredUser =
  /** Deleted already, as after a try whose answer was lost. */
  | { gone: true }
  | {
      gone: false;
      guest: boolean;
      /** Their address; a guest has none. */
      email: string | undefined;
      /** The language the account was made in. */
      locale: unknown;
    };

/** The user as stored, or null when Auth cannot say. */
export async function storedUser(admin: Client, userId: string): Promise<StoredUser | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error?.status === 404) return { gone: true };
  if (error || !data?.user) {
    logError('Reading the signed-in user failed', error);
    return null;
  }
  const { user } = data;
  return {
    gone: false,
    guest: user.is_anonymous === true,
    email: user.email || undefined,
    locale: user.user_metadata?.locale,
  };
}
