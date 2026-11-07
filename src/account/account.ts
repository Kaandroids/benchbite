import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import { useMutation } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { supabase } from '@/lib/supabase';
import { useSession, useUserEmail } from '@/providers/session-provider';

import { PASSWORD_LIMITS } from './passwords';

export type Credentials = { email: string; password: string };

/** The digits of the code sent by email, as `otp_length` in `supabase/config.toml`. */
export const CODE_LENGTH = 6;
/** How long before another code can be asked for, as `max_frequency` in `supabase/config.toml`. */
export const RESEND_SECONDS = 60;

/** A guest becoming an account, or a new user for someone without a session. */
export type NewAccountKind = 'guest' | 'new';

/** Where a form shows each reason: under the field it is about, or above the button. */
export function errorField(reason: AccountError): 'email' | 'password' | 'current' | null {
  switch (reason) {
    case 'wrongCurrentPassword':
      return 'current';
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
  | 'emailNotConfirmed'
  | 'invalidCode'
  | 'wrongCurrentPassword'
  | 'emailTaken'
  | 'invalidEmail'
  | 'weakPassword'
  | 'passwordTooLong'
  | 'rateLimited'
  | 'codeWait'
  | 'offline'
  | 'unknown';

// The codes Supabase Auth answers with, by what they mean to the user.
const AUTH_ERRORS: Record<string, AccountError> = {
  invalid_credentials: 'invalidCredentials',
  email_not_confirmed: 'emailNotConfirmed',
  otp_expired: 'invalidCode',
  email_exists: 'emailTaken',
  user_already_exists: 'emailTaken',
  email_address_invalid: 'invalidEmail',
  weak_password: 'weakPassword',
  over_request_rate_limit: 'rateLimited',
  // Another code within a minute of the last, as for a guest who corrects their address.
  over_email_send_rate_limit: 'codeWait',
};

/** The current password given to change it was not the account's. */
class WrongCurrentPassword extends Error {}

/** The reason a request to Supabase Auth failed. */
export function accountError(error: unknown): AccountError {
  if (error instanceof WrongCurrentPassword) {
    return 'wrongCurrentPassword';
  }
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

/** A request to Supabase as a form holds it, to start a new attempt of it. */
type Attempt = { isPending: boolean; reset: () => void };

/**
 * Sets a field's value as a new attempt, without the request's last error. Resetting a running
 * request would leave the screen without its answer.
 */
export function startingAgain(request: Attempt) {
  return (set: (value: string) => void) => (value: string) => {
    set(value);
    if (!request.isPending) {
      request.reset();
    }
  };
}

/** The message that says why a request to Supabase Auth failed. */
export function accountErrorMessage(t: TFunction, error: unknown): string {
  return t(`account.errors.${accountError(error)}`, PASSWORD_LIMITS);
}

/** The reason a request failed, with the message that says it. */
export function useAccountError(error: unknown) {
  const { t } = useTranslation();
  return error
    ? { reason: accountError(error), message: accountErrorMessage(t, error) }
    : { reason: null, message: null };
}

/**
 * Saves the signed-in user's password. Being the password already counts as saved: the person knows
 * it, as after an answer that got lost or a new password that is the current one.
 */
async function savePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error && !(isAuthApiError(error) && error.code === 'same_password')) {
    throw error;
  }
}

const normalized = ({ email, password }: Credentials): Credentials => ({
  email: email.trim(),
  password,
});

/**
 * Starts an account and sends the code that confirms its email address, in the app's language
 * (ADR 0091). A guest's account is added to the guest user, so the id and all data stay the same
 * (ADR 0005), and the guest stays one until the code is confirmed. Auth takes their password only
 * after that, so `useConfirmAccount` sets it. Without a session, as after a guest session ended, a
 * new user is created instead. An account is refused: adding an email to it would replace its own.
 */
export function useCreateAccount() {
  const { i18n } = useTranslation();
  const session = useSession();
  const user = session.status === 'ready' ? session.session.user : null;
  return useMutation({
    mutationFn: async (credentials: Credentials): Promise<NewAccountKind> => {
      if (user && !user.is_anonymous) {
        throw new Error('Signed in to an account already');
      }
      const { email, password } = normalized(credentials);
      const data = { locale: i18n.language };
      const { error } = user
        ? await supabase.auth.updateUser({ email, data })
        : await supabase.auth.signUp({ email, password, options: { data } });
      if (error) {
        throw error;
      }
      return user ? 'guest' : 'new';
    },
  });
}

type ConfirmAccount = Credentials & { token: string; kind: NewAccountKind };

/**
 * Confirms a new account's email address with its code, then sets the password. A new user gave one
 * when signing up, but Auth keeps the first one given for an address nobody confirmed, which could
 * be someone else's (ADR 0091). The code can be used once, so a try after only the password failed
 * does not send it again, and `accepted` says that only the password is left.
 */
export function useConfirmAccount() {
  const [accepted, setAccepted] = useState(false);
  const mutation = useMutation({
    mutationFn: async ({ token, kind, ...credentials }: ConfirmAccount) => {
      const { email, password } = normalized(credentials);
      if (!accepted) {
        const { error } = await supabase.auth.verifyOtp({
          email,
          token,
          type: kind === 'guest' ? 'email_change' : 'signup',
        });
        if (error) {
          throw error;
        }
        setAccepted(true);
      }
      await savePassword(password);
    },
  });
  return { ...mutation, accepted };
}

/**
 * Sends a new account's code again. A guest's address is only pending, where `resend` does not find
 * it and answers as if it had sent the code, so a guest asks for the change again.
 */
export function useResendCode() {
  return useMutation({
    mutationFn: async ({ kind, ...address }: { email: string; kind: NewAccountKind }) => {
      const email = address.email.trim();
      const { error } =
        kind === 'guest'
          ? await supabase.auth.updateUser({ email })
          : await supabase.auth.resend({ email, type: 'signup' });
      if (error) {
        throw error;
      }
    },
  });
}

/**
 * Sends a code to choose a new password with (ADR 0092). Auth answers the same for an address
 * without an account, so nobody learns which addresses have one.
 */
export function useSendResetCode() {
  return useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) {
        throw error;
      }
    },
  });
}

/**
 * Signs in to an account with a reset code. Auth then reports a password recovery, and the app asks
 * for the new password before anything else (ADR 0092).
 */
export function useConfirmReset() {
  return useMutation({
    mutationFn: async ({ email, token }: { email: string; token: string }) => {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: 'recovery',
      });
      if (error) {
        throw error;
      }
    },
  });
}

/** Saves the password chosen after a reset code, and lets the app go on. */
export function useSaveNewPassword() {
  const { passwordChosen } = useSession();
  return useMutation({
    mutationFn: async (password: string) => {
      await savePassword(password);
    },
    onSuccess: passwordChosen,
  });
}

/**
 * Changes the signed-in account's password. The app checks the current one by signing in with it,
 * as Auth does not; Auth only refuses a session older than a day (ADR 0093).
 */
export function useChangePassword() {
  const email = useUserEmail();
  return useMutation({
    mutationFn: async ({ current, password }: { current: string; password: string }) => {
      if (!email) {
        throw new Error('No account is signed in');
      }
      const signIn = await supabase.auth.signInWithPassword({ email, password: current });
      if (signIn.error) {
        throw isAuthApiError(signIn.error) && signIn.error.code === 'invalid_credentials'
          ? new WrongCurrentPassword()
          : signIn.error;
      }
      await savePassword(password);
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

/**
 * Deletes the user on this device, guest or account, and all that is theirs (ADR 0087); the app
 * starts over as a new guest.
 */
export function useDeleteAccount() {
  const { leaveDeletedUser } = useSession();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) {
        throw error;
      }
      await leaveDeletedUser();
    },
  });
}
