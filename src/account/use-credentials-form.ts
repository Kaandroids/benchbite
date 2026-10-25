import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { accountError } from './account';
import { PASSWORD_LIMITS } from './passwords';

type Request = { isPending: boolean; error: unknown; reset: () => void };

/**
 * The email and password typed into an account form, and why its request failed. A change starts
 * a new attempt without the last one's error.
 */
export function useCredentialsForm(request: Request) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const reason = request.error ? accountError(request.error) : null;

  const change = (set: (value: string) => void) => (value: string) => {
    set(value);
    // Resetting a running request would leave the screen without its answer.
    if (!request.isPending) {
      request.reset();
    }
  };

  return {
    email,
    password,
    setEmail: change(setEmail),
    setPassword: change(setPassword),
    reason,
    message: reason ? t(`account.errors.${reason}`, PASSWORD_LIMITS) : null,
  };
}
