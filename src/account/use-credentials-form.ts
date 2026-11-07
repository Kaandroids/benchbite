import { useState } from 'react';

import { useAccountError } from './account';

type Request = { isPending: boolean; error: unknown; reset: () => void };

/**
 * Sets a field's value as a new attempt, without the request's last error. Resetting a running
 * request would leave the screen without its answer.
 */
export function startingAgain(request: Pick<Request, 'isPending' | 'reset'>) {
  return (set: (value: string) => void) => (value: string) => {
    set(value);
    if (!request.isPending) {
      request.reset();
    }
  };
}

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
