import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';

import { readItem, writeItem } from '@/lib/device-storage';
import { supabase } from '@/lib/supabase';

type SessionState =
  | { status: 'loading' }
  | { status: 'ready'; session: Session }
  | { status: 'error'; error: Error }
  /** The session of the user who used this device ended, and with it the way to their data. */
  | { status: 'ended' };

type SessionContextValue = SessionState & {
  /** Tries the anonymous sign-in again after it failed. */
  retry: () => Promise<void>;
  /** After a session ended, starts over as a new guest. */
  startAgain: () => Promise<void>;
};

/** The id of the user signed in on this device last, to tell a first start from a lost session. */
const LAST_USER_KEY = 'session.last-user';

const lastUser = () => readItem(LAST_USER_KEY);
const rememberUser = (userId: string | null) => writeItem(LAST_USER_KEY, userId);

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
 * when no session is stored, a new anonymous user is created. When the session of a user who
 * used this device ends, as when it can no longer be refreshed, their data is out of reach: the
 * app says so first instead of quietly starting over as someone new.
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
        rememberUser(session.user.id);
        setState({ status: 'ready', session });
        return;
      }
      if (lastUser()) {
        setState({ status: 'ended' });
        return;
      }
      // There is no stored session (first launch) or the session ended. Calling Supabase inside
      // this callback can deadlock the client, so the sign-in runs after it returns.
      setTimeout(() => void startAnonymousSession(), 0);
    });
    return () => subscription.unsubscribe();
  }, [startAnonymousSession]);

  const startAgain = useCallback(async () => {
    rememberUser(null);
    setState({ status: 'loading' });
    await startAnonymousSession();
  }, [startAnonymousSession]);

  return (
    <SessionContext value={{ ...state, retry: startAnonymousSession, startAgain }}>
      {children}
    </SessionContext>
  );
}

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside a SessionProvider.');
  }
  return value;
}

/** The signed-in user's id, once there is a session. */
export function useUserId(): string | undefined {
  const state = useSession();
  return state.status === 'ready' ? state.session.user.id : undefined;
}
