import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { act, renderHook } from '@/test/render';
import { sessionValue } from '@/test/context-mocks';

import { accountError, useCreateAccount, useSignIn, useSignOut } from './account';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { updateUser: jest.fn(), signUp: jest.fn(), signInWithPassword: jest.fn() },
  },
}));
jest.mock('@/providers/session-provider', () => ({ useSession: jest.fn() }));

const auth = jest.mocked(supabase.auth);
const signOut = jest.fn();
const CREDENTIALS = { email: ' kaan@example.com ', password: 'secret12' };
const TRIMMED = { email: 'kaan@example.com', password: 'secret12' };

function given(status: 'ready' | 'ended') {
  jest
    .mocked(useSession)
    .mockReturnValue(sessionValue(status === 'ready' ? 'guest' : { status }, { signOut }));
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
    ['weak_password', 'weakPassword'],
    ['over_request_rate_limit', 'rateLimited'],
    ['something_new', 'unknown'],
  ])('reads %s as %s', (code, reason) => {
    expect(accountError(apiError(code))).toBe(reason);
  });

  it.each([
    ['Unable to validate email address: invalid format', 'invalidEmail'],
    ['Password cannot be longer than 72 characters', 'passwordTooLong'],
    ['Something else is missing', 'unknown'],
  ])('reads a failed validation with "%s" as %s', (message, reason) => {
    expect(accountError(new AuthApiError(message, 400, 'validation_failed'))).toBe(reason);
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
    const { result } = await renderHook(useCreateAccount);
    await act(() => result.current.mutateAsync(CREDENTIALS));
    expect(auth.updateUser).toHaveBeenCalledWith(TRIMMED);
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('creates a new user when the guest session ended', async () => {
    given('ended');
    const { result } = await renderHook(useCreateAccount);
    await act(() => result.current.mutateAsync(CREDENTIALS));
    expect(auth.signUp).toHaveBeenCalledWith(TRIMMED);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('fails with the error Supabase answers', async () => {
    auth.updateUser.mockResolvedValue({ data: {}, error: apiError('email_exists') } as never);
    const { result } = await renderHook(useCreateAccount);
    await expect(act(() => result.current.mutateAsync(CREDENTIALS))).rejects.toMatchObject({
      code: 'email_exists',
    });
  });
});

describe('useSignIn', () => {
  it('signs in', async () => {
    const { result } = await renderHook(useSignIn);
    await act(() => result.current.mutateAsync(CREDENTIALS));
    expect(auth.signInWithPassword).toHaveBeenCalledWith(TRIMMED);
  });

  it('fails with the error Supabase answers', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: apiError('invalid_credentials'),
    } as never);
    const { result } = await renderHook(useSignIn);
    await expect(act(() => result.current.mutateAsync(CREDENTIALS))).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
  });
});

describe('useSignOut', () => {
  it('signs out', async () => {
    const { result } = await renderHook(useSignOut);
    await act(() => result.current.mutateAsync());
    expect(signOut).toHaveBeenCalled();
  });
});
