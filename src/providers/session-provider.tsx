import { isAuthApiError, type Session } from '@supabase/supabase-js';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';

import { readItem, writeItem } from '@/lib/device-storage';
import { supabase } from '@/lib/supabase';

export type SessionState =
  | { status: 'loading' }
  | { status: 'ready'; session: Session }
  | { status: 'error'; error: Error }
  /** The session of the user who used this device ended, and with it the way to their data. */
  | { status: 'ended'; reason: EndedReason };

/**
 * Why the session of the last user ended: a guest's is lost for good; an account's may have been
 * signed out elsewhere or deleted, which this device can no longer tell once its token is gone;
 * or the account was found deleted, as on the website, while its token still worked.
 */
export type EndedReason = 'guest' | 'account' | 'deleted';

type SessionContextValue = SessionState & {
  /** Tries the anonymous sign-in again after it failed. */
  retry: () => Promise<void>;
  /** After a session ended, starts over as a new guest. */
  startAgain: () => Promise<void>;
  /** After the user on this device was deleted, drops their session and starts as a new guest. */
  leaveDeletedUser: () => Promise<void>;
  /** Signs the account out on this device and starts over as a new guest. */
  signOut: () => Promise<void>;
  /** Signed in with a reset code, so the account needs a new password first (ADR 0092). */
  recovering: boolean;
  /** The new password after a reset code is saved. */
  passwordChosen: () => void;
};

/** The id of the user signed in on this device last, to tell a first start from a lost session. */
const LAST_USER_KEY = 'session.last-user';
/** Whether that user had an account, so that a session that ends is told apart from a guest's. */
const LAST_USER_ACCOUNT_KEY = 'session.last-user-account';

const lastUser = () => readItem(LAST_USER_KEY);
const lastUserHadAccount = () => readItem(LAST_USER_ACCOUNT_KEY) === 'true';
/** Why the last user's session ended: `deleted` when it was found so, else whose it was. */
const endedReason = (deleted: boolean): EndedReason =>
  deleted ? 'deleted' : lastUserHadAccount() ? 'account' : 'guest';
const rememberUser = (user: Session['user'] | null) => {
  writeItem(LAST_USER_KEY, user?.id ?? null);
  writeItem(LAST_USER_ACCOUNT_KEY, user ? String(user.is_anonymous === false) : null);
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
 * when no session is stored, a new anonymous user is created. When the session of a user who
 * used this device ends, as when it can no longer be refreshed, their data is out of reach: the
 * app says so first instead of quietly starting over as someone new.
 */
export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  // Kept here, outside what starts again for another user, as the reset code signs in as one.
  const [recovering, setRecovering] = useState(false);
  // Set when an account was found deleted, so that the session that ends says so, until another
  // session starts.
  const deleted = useRef(false);

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
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        deleted.current = false;
        rememberUser(session.user);
        setState({ status: 'ready', session });
        if (event === 'PASSWORD_RECOVERY') {
          setRecovering(true);
        }
        return;
      }
      setRecovering(false);
      if (lastUser()) {
        setState({ status: 'ended', reason: endedReason(deleted.current) });
        return;
      }
      // There is no stored session (first launch) or the session ended. Calling Supabase inside
      // this callback can deadlock the client, so the sign-in runs after it returns.
      setTimeout(() => void startAnonymousSession(), 0);
    });
    return () => subscription.unsubscribe();
  }, [startAnonymousSession]);

  // An account deleted elsewhere, as on the website, keeps a token that works for up to an hour,
  // with which every read comes back empty. The user is asked for when the app opens and comes back
  // from the background, and an account no longer there is signed out on this device. A guest removed
  // after 90 days ends as a guest's session does (ADR 0131). Offline, nothing is known, and nothing
  // changes.
  const userId = state.status === 'ready' ? state.session.user.id : undefined;
  useEffect(() => {
    if (!userId) return;
    const check = async () => {
      const { error } = await supabase.auth.getUser();
      if (!isAuthApiError(error) || error.code !== 'user_not_found') return;
      deleted.current = lastUserHadAccount();
      // The session that ends says why, in onAuthStateChange.
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) {
        setState({ status: 'ended', reason: endedReason(deleted.current) });
      }
    };
    void check();
    // Only on coming back from the background: a sheet of the system, as Face ID or the Control
    // Center, makes the app inactive and active again without leaving it.
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (previous === 'background' && next === 'active') void check();
      previous = next;
    });
    return () => subscription.remove();
  }, [userId]);

  const startAgain = useCallback(async () => {
    rememberUser(null);
    setState({ status: 'loading' });
    await startAnonymousSession();
  }, [startAnonymousSession]);

  const leaveDeletedUser = useCallback(async () => {
    // Forgetting the user makes the session that ends start a new guest. A session left on the
    // device would open again as a user who no longer exists.
    rememberUser(null);
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    // Still there, as offline: signing in as a new guest is what replaces it.
    if (error) {
      await startAnonymousSession();
    }
  }, [startAnonymousSession]);

  const signOut = useCallback(async () => {
    // Signing out needs a session that is still valid. One that cannot be refreshed, as offline,
    // fails here and stays signed in, rather than in the middle of signing out.
    const { error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }
    // Forgetting the user first makes the session that ends start a new guest, instead of saying
    // that it ended. Only this device signs out; the account stays signed in elsewhere.
    rememberUser(null);
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (!error) {
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      // It did not sign out, so the user is still the one to remember.
      rememberUser(data.session.user);
      throw error;
    }
    // The session on the device is gone; only revoking it on the server failed.
    console.warn('Could not revoke the session', error);
  }, []);

  const passwordChosen = useCallback(() => setRecovering(false), []);

  return (
    <SessionContext
      value={{
        ...state,
        retry: startAnonymousSession,
        startAgain,
        leaveDeletedUser,
        signOut,
        recovering,
        passwordChosen,
      }}
    >
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

/** The signed-in account's email address; none for a guest. */
export function useUserEmail(): string | undefined {
  const state = useSession();
  return state.status === 'ready' ? state.session.user.email || undefined : undefined;
}

/** Whether the signed-in user has an account, as opposed to being a guest (ADR 0031). */
export function useIsAccount(): boolean {
  const state = useSession();
  return state.status === 'ready' && state.session.user.is_anonymous === false;
}
