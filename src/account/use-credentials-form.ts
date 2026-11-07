import { useState } from 'react';

import { startingAgain, useAccountError } from './account';

type Request = { isPending: boolean; error: unknown; reset: () => void };

/**
 * The email and password typed into an account form, and why its request failed. A change starts
 * a new attempt without the last one's error.
 */
export function useCredentialsForm(request: Request) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { reason, message } = useAccountError(request.error);

  const change = startingAgain(request);

  return {
    email,
    password,
    setEmail: change(setEmail),
    setPassword: change(setPassword),
    reason,
    message,
  };
}
