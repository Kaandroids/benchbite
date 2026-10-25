import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { endSession } from '@/sessions/session';
import { act, createTestQueryClient, renderHook } from '@/test/render';

import { accountError, useCreateAccount, useSignIn, useSignOut } from './account';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { updateUser: jest.fn(), signUp: jest.fn(), signInWithPassword: jest.fn() },
  },
}));
jest.mock('@/providers/session-provider', () => ({ useSession: jest.fn() }));
jest.mock('@/sessions/session', () => ({ endSession: jest.fn() }));

const auth = jest.mocked(supabase.auth);
const signOut = jest.fn();
const CREDENTIALS = { email: ' kaan@example.com ', password: 'secret12' };
const TRIMMED = { email: 'kaan@example.com', password: 'secret12' };

function given(status: 'ready' | 'ended') {
  jest.mocked(useSession).mockReturnValue({
    ...(status === 'ready' ? { status, session: { user: { id: 'guest' } } as never } : { status }),
    retry: jest.fn(),
    startAgain: jest.fn(),
    signOut,
  });
}

function render<T>(hook: () => T) {
  return renderHook(hook, { queryClient: createTestQueryClient() });
}

const apiError = (code: string) => new AuthApiError('refused', 422, code);

beforeEach(() => {
  jest.clearAllMocks();
  given('ready');
  auth.updateUser.mockResolvedValue({ data: {}, error: null } as never);
  auth.signUp.mockResolvedValue({ data: {}, error: null } as never);
  auth.signInWithPassword.mockResolvedValue({ data: {}, error: null } as never);
});

describe('accountError', () => {
  it.each([
    ['invalid_credentials', 'invalidCredentials'],
    ['email_exists', 'emailTaken'],
    ['user_already_exists', 'emailTaken'],
    ['validation_failed', 'invalidEmail'],
    ['weak_password', 'weakPassword'],
    ['over_request_rate_limit', 'rateLimited'],
    ['something_new', 'unknown'],
  ])('reads %s as %s', (code, reason) => {
    expect(accountError(apiError(code))).toBe(reason);
  });

  it('tells a missing connection apart', () => {
    expect(accountError(new AuthRetryableFetchError('Failed to fetch', 0))).toBe('offline');
  });

  it('reads anything else as unknown', () => {
    expect(accountError(new Error('boom'))).toBe('unknown');
  });
});

describe('useCreateAccount', () => {
  it('adds the email and password to the guest, keeping their data', async () => {
    const { result } = await render(useCreateAccount);
    await act(() => result.current.mutateAsync(CREDENTIALS));
    expect(auth.updateUser).toHaveBeenCalledWith(TRIMMED);
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(endSession).not.toHaveBeenCalled();
  });

  it('creates a new user when the guest session ended', async () => {
    given('ended');
    const { result } = await render(useCreateAccount);
    await act(() => result.current.mutateAsync(CREDENTIALS));
    expect(auth.signUp).toHaveBeenCalledWith(TRIMMED);
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(endSession).toHaveBeenCalled();
  });

  it('fails with the error Supabase answers', async () => {
    auth.updateUser.mockResolvedValue({ data: {}, error: apiError('email_exists') } as never);
    const { result } = await render(useCreateAccount);
    await expect(act(() => result.current.mutateAsync(CREDENTIALS))).rejects.toMatchObject({
      code: 'email_exists',
    });
  });
});

describe('useSignIn', () => {
  it('signs in and drops the previous user’s workout in progress', async () => {
    const { result } = await render(useSignIn);
    await act(() => result.current.mutateAsync(CREDENTIALS));
    expect(auth.signInWithPassword).toHaveBeenCalledWith(TRIMMED);
    expect(endSession).toHaveBeenCalled();
  });

  it('keeps the workout in progress when the sign-in fails', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: apiError('invalid_credentials'),
    } as never);
    const { result } = await render(useSignIn);
    await expect(act(() => result.current.mutateAsync(CREDENTIALS))).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
    expect(endSession).not.toHaveBeenCalled();
  });
});

describe('useSignOut', () => {
  it('ends the workout in progress and signs out', async () => {
    const { result } = await render(useSignOut);
    await act(() => result.current.mutateAsync());
    expect(endSession).toHaveBeenCalled();
    expect(signOut).toHaveBeenCalled();
  });
});
