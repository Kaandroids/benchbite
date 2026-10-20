import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';

import { supabase } from '@/lib/supabase';

type SessionState =
  { status: 'loading' } | { status: 'ready'; session: Session } | { status: 'error'; error: Error };

type SessionContextValue = SessionState & {
  /** Tries the anonymous sign-in again after it failed. */
  retry: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

let pendingSignIn: Promise<void> | null = null;

// Concurrent calls share one request. React runs effects twice in development, and two requests
// would create two anonymous users.
function signInAnonymously(): Promise<void> {
  pendingSignIn ??= supabase.auth
    .signInAnonymously()
    .then(({ error }) => {
      if (error) throw error;
    })
    .finally(() => {
      pendingSignIn = null;
    });
  return pendingSignIn;
}

/**
 * Makes sure there is always a signed-in user. People can use the app without an account, so
 * when no session is stored, a new anonymous user is created.
 */
export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  const startAnonymousSession = useCallback(async () => {
    try {
      // On success, onAuthStateChange receives the new session.
      await signInAnonymously();
    } catch (error) {
      setState({
        status: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setState({ status: 'ready', session });
        return;
      }
      // There is no stored session (first launch) or the session ended. Calling Supabase inside
      // this callback can deadlock the client, so the sign-in runs after it returns.
      setTimeout(() => void startAnonymousSession(), 0);
    });
    return () => subscription.unsubscribe();
  }, [startAnonymousSession]);

  return (
    <SessionContext value={{ ...state, retry: startAnonymousSession }}>{children}</SessionContext>
  );
}

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside a SessionProvider.');
  }
  return value;
}
