import { useState } from 'react';

import { useAccountError } from './account';

type Request = { isPending: boolean; error: unknown; reset: () => void };

/**
 * The email and password typed into an account form, and why its request failed. A change starts
 * a new attempt without the last one's error.
 */
export function useCredentialsForm(request: Request) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { reason, message } = useAccountError(request.error);

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
    message,
  };
}
