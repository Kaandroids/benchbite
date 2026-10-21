import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { act, renderHook, waitFor } from '@/test/render';

import { SessionProvider, useSession } from './session-provider';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(),
      signInAnonymously: jest.fn(),
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
  listeners = [];
  auth.onAuthStateChange.mockImplementation((listener) => {
    listeners.push(listener as AuthListener);
    return { data: { subscription: { id: 'id', callback: jest.fn(), unsubscribe } } };
  });
  auth.signInAnonymously.mockResolvedValue({ data: {}, error: null } as never);
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

  it('unsubscribes from auth changes on unmount', async () => {
    const { unmount } = await renderSession();
    expect(unsubscribe).not.toHaveBeenCalled();
    await unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
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
