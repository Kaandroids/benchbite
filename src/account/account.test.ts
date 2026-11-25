import { AuthApiError, AuthRetryableFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { CaptchaError } from '@/captcha/captcha';
import { isExpected } from '@/lib/reporting';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { act, renderHook } from '@/test/render';
import { sessionValue } from '@/test/context-mocks';

import {
  accountError,
  useAccountError,
  useCreateAccount,
  useSendDeletionCode,
  useSignIn,
  useSignOut,
} from './account';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { updateUser: jest.fn(), signUp: jest.fn(), signInWithPassword: jest.fn() },
    functions: { invoke: jest.fn() },
  },
}));
jest.mock('@/providers/session-provider', () => ({ useSession: jest.fn() }));

const auth = jest.mocked(supabase.auth);
const signOut = jest.fn();
const CREDENTIALS = { email: ' kaan@example.com ', password: 'secret12' };
const TRIMMED = { email: 'kaan@example.com', password: 'secret12' };
const LOCALE = { locale: 'en' };

function given(status: 'ready' | 'ended') {
  jest
    .mocked(useSession)
    .mockReturnValue(
      sessionValue(status === 'ready' ? 'guest' : { status, reason: 'guest' }, { signOut }),
    );
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
    ['over_email_send_rate_limit', 'codeWait'],
    ['captcha_failed', 'captcha'],
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

  it.each([500, 502, 504])(
    'reads a server error (%i), which supabase-js also calls retryable, as one',
    (status) => {
      expect(accountError(new AuthRetryableFetchError('Server error', status))).toBe('serverError');
    },
  );

  it('reads anything else as unknown', () => {
    expect(accountError(new Error('boom'))).toBe('unknown');
  });

  it('reads a captcha that gave no token as such, reported unless the page could not load', () => {
    expect(accountError(new CaptchaError('failed', 'timeout'))).toBe('captcha');
    expect(isExpected(new CaptchaError('failed', 'timeout'))).toBe(false);
    expect(isExpected(new CaptchaError('failed', 'load', true))).toBe(true);
  });
});

describe('useAccountError', () => {
  it('says why a request failed', async () => {
    const { result } = await renderHook(() => useAccountError(new CaptchaError('failed')));
    expect(result.current).toEqual({
      reason: 'captcha',
      message: 'We couldn’t check that you’re a person. Check your connection and try again.',
    });
  });

  it('says nothing of a check the person closed', async () => {
    const { result } = await renderHook(() => useAccountError(new CaptchaError('cancelled')));
    expect(result.current).toEqual({ reason: null, message: null });
  });
});

describe('useCreateAccount', () => {
  it('adds the email to the guest, keeping their data, with the password left for later', async () => {
    const { result } = await renderHook(useCreateAccount);
    await expect(act(() => result.current.mutateAsync(CREDENTIALS))).resolves.toBe('guest');
    expect(auth.updateUser).toHaveBeenCalledWith({ email: TRIMMED.email, data: LOCALE });
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('creates a new user when the guest session ended', async () => {
    given('ended');
    const { result } = await renderHook(useCreateAccount);
    // Awaited, not with resolves: act's answer comes before the sign-up, which waits for the
    // captcha token.
    expect(await act(() => result.current.mutateAsync(CREDENTIALS))).toBe('new');
    expect(auth.signUp).toHaveBeenCalledWith({
      ...TRIMMED,
      options: { data: LOCALE, captchaToken: 'captcha-token' },
    });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('refuses an account, whose own email and password it would replace', async () => {
    jest
      .mocked(useSession)
      .mockReturnValue(sessionValue('user-1', { isAnonymous: false, signOut }));
    const { result } = await renderHook(useCreateAccount);
    await expect(act(() => result.current.mutateAsync(CREDENTIALS))).rejects.toThrow();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signUp).not.toHaveBeenCalled();
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
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      ...TRIMMED,
      options: { captchaToken: 'captcha-token' },
    });
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

describe('a refusal of the account’s functions', () => {
  /** The error the hook fails with when the function answers `status` with this body. */
  async function refusal(status: number, body: object) {
    jest.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(new Response(JSON.stringify(body), { status })),
    } as never);
    const { result } = await renderHook(() => useSendDeletionCode());
    let caught: unknown;
    await act(async () => {
      caught = await result.current.mutateAsync().catch((error: unknown) => error);
    });
    return caught;
  }

  it.each([
    [403, { error: 'wrong_code' }],
    [429, { error: 'too_soon' }],
    [401, {}],
  ])('is expected when the screens explain it: %d %o', async (status, body) => {
    expect(isExpected(await refusal(status, body))).toBe(true);
  });

  it.each([
    [400, { error: 'proof_required' }],
    [400, {}],
    [503, { error: 'unavailable' }],
  ])('is reported when the app asked wrongly or the server failed: %d %o', async (status, body) => {
    expect(isExpected(await refusal(status, body))).toBe(false);
  });
});
