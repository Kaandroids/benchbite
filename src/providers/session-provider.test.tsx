import type { Session } from '@supabase/supabase-js';
import { Storage } from 'expo-sqlite/kv-store';

import { supabase } from '@/lib/supabase';
import { act, renderHook, waitFor } from '@/test/render';

import { SessionProvider, useIsAccount, useSession } from './session-provider';

jest.mock('expo-sqlite/kv-store', () => {
  const items = new Map<string, string>();
  return {
    Storage: {
      getItemSync: (key: string) => items.get(key) ?? null,
      setItemSync: (key: string, value: string) => void items.set(key, value),
      removeItemSync: (key: string) => void items.delete(key),
      clearSync: () => items.clear(),
    },
  };
});
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(),
      signInAnonymously: jest.fn(),
      signOut: jest.fn(),
      getSession: jest.fn(),
    },
  },
}));

type AuthListener = (event: string, session: Session | null) => void;

const auth = jest.mocked(supabase.auth);
const unsubscribe = jest.fn();
let listeners: AuthListener[] = [];

const SESSION = { access_token: 'token', user: { id: 'user-1' } } as Session;

async function emit(session: Session | null) {
  await act(() => {
    for (const listener of listeners) {
      listener(session ? 'SIGNED_IN' : 'INITIAL_SESSION', session);
    }
  });
}

function renderSession() {
  return renderHook(() => useSession(), { wrapper: SessionProvider });
}

beforeEach(() => {
  jest.clearAllMocks();
  (Storage as unknown as { clearSync: () => void }).clearSync();
  listeners = [];
  auth.onAuthStateChange.mockImplementation((listener) => {
    listeners.push(listener as AuthListener);
    return { data: { subscription: { id: 'id', callback: jest.fn(), unsubscribe } } };
  });
  auth.signInAnonymously.mockResolvedValue({ data: {}, error: null } as never);
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null } as never);
  auth.signOut.mockImplementation(async () => {
    await emit(null);
    return { error: null };
  });
});

describe('SessionProvider', () => {
  it('is loading until the client reports a session', async () => {
    const { result } = await renderSession();
    expect(result.current.status).toBe('loading');
  });

  it('becomes ready with a stored session without signing in', async () => {
    const { result } = await renderSession();
    await emit(SESSION);
    expect(result.current).toMatchObject({ status: 'ready', session: SESSION });
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it('signs in anonymously when there is no stored session', async () => {
    const { result } = await renderSession();
    await emit(null);
    await waitFor(() => expect(auth.signInAnonymously).toHaveBeenCalledTimes(1));
    await emit(SESSION);
    expect(result.current).toMatchObject({ status: 'ready', session: SESSION });
  });

  it('shows the error when the sign-in fails and tries again on retry', async () => {
    auth.signInAnonymously.mockResolvedValueOnce({
      data: {},
      error: new Error('offline'),
    } as never);
    const { result } = await renderSession();
    await emit(null);
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current).toMatchObject({ error: new Error('offline') });

    await act(() => result.current.retry());
    expect(auth.signInAnonymously).toHaveBeenCalledTimes(2);
    await emit(SESSION);
    expect(result.current.status).toBe('ready');
  });

  it('wraps errors that are not Error objects', async () => {
    auth.signInAnonymously.mockRejectedValueOnce('network down');
    const { result } = await renderSession();
    await emit(null);
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current).toMatchObject({ error: new Error('network down') });
  });

  it('shares one request between concurrent sign-ins', async () => {
    let finish: (value: unknown) => void = () => {};
    auth.signInAnonymously.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }) as never,
    );
    const { result } = await renderSession();
    const first = result.current.retry();
    const second = result.current.retry();
    expect(auth.signInAnonymously).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ data: {}, error: null });
      await Promise.all([first, second]);
    });

    auth.signInAnonymously.mockResolvedValue({ data: {}, error: null } as never);
    await act(() => result.current.retry());
    expect(auth.signInAnonymously).toHaveBeenCalledTimes(2);
  });

  it('says so when the session of the last user ends, instead of signing in as someone new', async () => {
    const { result } = await renderSession();
    await emit(SESSION);
    await emit(null);
    expect(result.current.status).toBe('ended');
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it('remembers the last user across starts of the app', async () => {
    const first = await renderSession();
    await emit(SESSION);
    await first.unmount();
    listeners = [];
    const { result } = await renderSession();
    await emit(null);
    expect(result.current.status).toBe('ended');
  });

  it('starts over as a new guest when asked, and then signs in quietly again', async () => {
    const { result } = await renderSession();
    await emit(SESSION);
    await emit(null);
    await act(() => result.current.startAgain());
    expect(auth.signInAnonymously).toHaveBeenCalledTimes(1);
    await emit({ ...SESSION, user: { id: 'user-2' } } as Session);
    expect(result.current.status).toBe('ready');
  });

  it('signs out on this device only and starts over as a new guest', async () => {
    const { result } = await renderSession();
    await emit(SESSION);
    await act(() => result.current.signOut());
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    await waitFor(() => expect(auth.signInAnonymously).toHaveBeenCalledTimes(1));
    expect(result.current.status).not.toBe('ended');
  });

  it('stays signed in when the session cannot be refreshed, as offline', async () => {
    auth.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: new Error('offline'),
    } as never);
    const { result } = await renderSession();
    await emit(SESSION);
    let failure: unknown;
    await act(async () => {
      failure = await result.current.signOut().catch((error: unknown) => error);
    });
    expect(failure).toEqual(new Error('offline'));
    expect(auth.signOut).not.toHaveBeenCalled();
    // A session that ends later is still reported as lost.
    await emit(null);
    expect(result.current.status).toBe('ended');
  });

  it('stays signed in and remembers the user when signing out left the session', async () => {
    auth.getSession
      .mockResolvedValueOnce({ data: { session: SESSION }, error: null } as never)
      .mockResolvedValueOnce({ data: { session: SESSION }, error: null } as never);
    auth.signOut.mockResolvedValueOnce({ error: new Error('locked') } as never);
    const { result } = await renderSession();
    await emit(SESSION);
    let failure: unknown;
    await act(async () => {
      failure = await result.current.signOut().catch((error: unknown) => error);
    });
    expect(failure).toEqual(new Error('locked'));
    await emit(null);
    expect(result.current.status).toBe('ended');
  });

  it('still starts over when the session could not be revoked on the server', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    auth.signOut.mockImplementationOnce(async () => {
      await emit(null);
      return { error: new Error('offline') } as never;
    });
    const { result } = await renderSession();
    await emit(SESSION);
    await act(() => result.current.signOut());
    await waitFor(() => expect(auth.signInAnonymously).toHaveBeenCalledTimes(1));
  });

  it('unsubscribes from auth changes on unmount', async () => {
    const { unmount } = await renderSession();
    expect(unsubscribe).not.toHaveBeenCalled();
    await unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('useIsAccount', () => {
  it('tells an account apart from a guest', async () => {
    const { result } = await renderHook(() => useIsAccount(), { wrapper: SessionProvider });
    expect(result.current).toBe(false);
    await emit({ ...SESSION, user: { id: 'user-1', is_anonymous: true } } as Session);
    expect(result.current).toBe(false);
    await emit({ ...SESSION, user: { id: 'user-1', is_anonymous: false } } as Session);
    expect(result.current).toBe(true);
  });
});

describe('useSession', () => {
  it('throws outside a SessionProvider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderHook(() => useSession())).rejects.toThrow(
      'useSession must be used inside a SessionProvider.',
    );
  });
});
