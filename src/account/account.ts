import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import { useMutation } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

export type Credentials = { email: string; password: string };

/** Where a form shows each reason: under the field it is about, or above the button. */
export function errorField(reason: AccountError): 'email' | 'password' | null {
  switch (reason) {
    case 'emailTaken':
    case 'invalidEmail':
      return 'email';
    case 'weakPassword':
    case 'passwordTooLong':
      return 'password';
    default:
      return null;
  }
}

/** Why creating an account or signing in failed, as far as the app tells the reasons apart. */
export type AccountError =
  | 'invalidCredentials'
  | 'emailTaken'
  | 'invalidEmail'
  | 'weakPassword'
  | 'passwordTooLong'
  | 'rateLimited'
  | 'offline'
  | 'unknown';

// The codes Supabase Auth answers with, by what they mean to the user.
const AUTH_ERRORS: Record<string, AccountError> = {
  invalid_credentials: 'invalidCredentials',
  email_exists: 'emailTaken',
  user_already_exists: 'emailTaken',
  email_address_invalid: 'invalidEmail',
  weak_password: 'weakPassword',
  over_request_rate_limit: 'rateLimited',
  over_email_send_rate_limit: 'rateLimited',
};

/** The reason a request to Supabase Auth failed. */
export function accountError(error: unknown): AccountError {
  if (isAuthRetryableFetchError(error)) {
    return 'offline';
  }
  if (isAuthApiError(error) && error.code === 'validation_failed') {
    // One code for any input Auth refuses; only the message says which.
    return /email/i.test(error.message)
      ? 'invalidEmail'
      : /longer than/i.test(error.message)
        ? 'passwordTooLong'
        : 'unknown';
  }
  if (isAuthApiError(error) && error.code) {
    return AUTH_ERRORS[error.code] ?? 'unknown';
  }
  return 'unknown';
}

const normalized = ({ email, password }: Credentials): Credentials => ({
  email: email.trim(),
  password,
});

/**
 * Creates an account with an email address and a password. A guest's account is created by adding
 * them to the guest user, so the id and all data stay the same (ADR 0005). Without a session, as
 * after a guest session ended, a new user is created instead. An account is refused: adding an
 * email and a password to it would replace its own, without asking for the current password.
 */
export function useCreateAccount() {
  const session = useSession();
  const user = session.status === 'ready' ? session.session.user : null;
  return useMutation({
    mutationFn: async (credentials: Credentials) => {
      if (user && !user.is_anonymous) {
        throw new Error('Signed in to an account already');
      }
      const { error } = user
        ? await supabase.auth.updateUser(normalized(credentials))
        : await supabase.auth.signUp(normalized(credentials));
      if (error) {
        throw error;
      }
    },
  });
}

/**
 * Signs in to an account. A guest who signs in leaves their guest data behind for good, so the
 * screens warn about it first.
 */
export function useSignIn() {
  return useMutation({
    mutationFn: async (credentials: Credentials) => {
      const { error } = await supabase.auth.signInWithPassword(normalized(credentials));
      if (error) {
        throw error;
      }
    },
  });
}

/** Signs the account out on this device; the app starts over as a new guest. */
export function useSignOut() {
  const { signOut } = useSession();
  return useMutation({ mutationFn: signOut });
}
