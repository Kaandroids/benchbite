import i18n from '@/i18n';
import { readItem, writeItem } from '@/lib/device-storage';
import { supabase } from '@/lib/supabase';
import { useOnboarding } from '@/providers/onboarding-provider';
import { useSession, useUserId } from '@/providers/session-provider';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import { useAgreement } from './requirements';
import { useAcceptTerms, usePutOffTerms, useTermsAsk } from './terms-update';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@/lib/device-storage', () => ({ readItem: jest.fn(), writeItem: jest.fn() }));
jest.mock('@/providers/session-provider', () => ({ useSession: jest.fn(), useUserId: jest.fn() }));
jest.mock('@/providers/onboarding-provider', () => ({ useOnboarding: jest.fn() }));
jest.mock('./requirements', () => ({
  REQUIREMENTS_KEY: ['requirements'],
  useAgreement: jest.fn(),
}));

const NOW = new Date('2027-02-10T09:00:00');
/** New terms, announced for a day to come. */
const TERMS = {
  version: '2027-02-01',
  appliesAt: '2027-03-03T00:00:00+00:00',
  summary: { en: 'Premium by the year', de: 'Premium im Jahr' },
};

/** The server's history of the user's acceptances, whose latest version is `version`. */
function accepted(version: string | null, error: unknown = null) {
  const limit = jest
    .fn()
    .mockResolvedValue({ data: version ? [{ terms_version: version }] : [], error });
  const sorted = { order: () => sorted, limit };
  jest.mocked(supabase.from).mockReturnValue({ select: () => sorted } as never);
}
const signedIn = (status = 'ready', completed = true, userId = 'user-1') => {
  jest.mocked(useSession).mockReturnValue({ status } as never);
  jest.mocked(useUserId).mockReturnValue(status === 'ready' ? userId : undefined);
  jest.mocked(useOnboarding).mockReturnValue({ completed } as never);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.mocked(readItem).mockReturnValue(null);
  jest.mocked(useAgreement).mockReturnValue(TERMS);
  signedIn();
  accepted('2026-11-18');
});
afterEach(async () => {
  jest.useRealTimers();
  // Back from the language a test chose.
  await i18n.changeLanguage('en');
});

it('asks for terms newer than the ones accepted, saying when they apply and what changed', async () => {
  const { result } = await renderHook(() => useTermsAsk());
  await waitFor(() => expect(result.current).not.toBeNull());
  expect(result.current).toEqual({
    version: '2027-02-01',
    appliesAt: new Date('2027-03-03T00:00:00+00:00'),
    due: false,
    summary: 'Premium by the year',
  });
  expect(supabase.from).toHaveBeenCalledWith('terms_acceptances');
});

it('waits for the answer from the day they apply', async () => {
  jest.mocked(useAgreement).mockReturnValue({ ...TERMS, appliesAt: '2027-02-10T00:00:00+00:00' });
  const { result } = await renderHook(() => useTermsAsk());
  await waitFor(() => expect(result.current?.due).toBe(true));
});

it('asks a user who never accepted any', async () => {
  accepted(null);
  const { result } = await renderHook(() => useTermsAsk());
  await waitFor(() => expect(result.current?.version).toBe('2027-02-01'));
});

it('asks nothing of a user who accepted the current terms', async () => {
  accepted('2027-02-01');
  const { result } = await renderHook(() => useTermsAsk());
  await waitFor(() => expect(supabase.from).toHaveBeenCalled());
  expect(result.current).toBeNull();
});

it('asks nothing while it does not know: no answer of the server, or no history', async () => {
  jest.mocked(useAgreement).mockReturnValue(undefined);
  const unknown = await renderHook(() => useTermsAsk());
  expect(unknown.result.current).toBeNull();

  jest.mocked(useAgreement).mockReturnValue(TERMS);
  accepted(null, { code: '57014', message: 'timeout' });
  const failed = await renderHook(() => useTermsAsk());
  await waitFor(() => expect(supabase.from).toHaveBeenCalled());
  expect(failed.result.current).toBeNull();
});

it('leaves the onboarding and a missing session alone, without reading the history', async () => {
  signedIn('ready', false);
  const onboarding = await renderHook(() => useTermsAsk());
  expect(onboarding.result.current).toBeNull();
  signedIn('ended');
  const ended = await renderHook(() => useTermsAsk());
  expect(ended.result.current).toBeNull();
  expect(supabase.from).not.toHaveBeenCalled();
});

it('falls back to English for what changed, and says nothing without a summary', async () => {
  jest.mocked(useAgreement).mockReturnValue({ ...TERMS, summary: { de: 'Premium im Jahr' } });
  const { result } = await renderHook(() => useTermsAsk());
  await waitFor(() => expect(result.current).not.toBeNull());
  expect(result.current?.summary).toBeUndefined();

  // An empty text in the user's language is none: English stands in.
  await i18n.changeLanguage('de');
  jest.mocked(useAgreement).mockReturnValue({ ...TERMS, summary: { en: 'By the year', de: ' ' } });
  const german = await renderHook(() => useTermsAsk());
  await waitFor(() => expect(german.result.current?.summary).toBe('By the year'));
});

describe('at the start of the app', () => {
  /** What the device kept: the version this user accepted last, as the server said it. */
  const kept = (userId: string, version: string | null) =>
    jest
      .mocked(readItem)
      .mockImplementation((key) =>
        key === 'terms-accepted' ? JSON.stringify({ userId, version }) : null,
      );

  it('asks at once, from the version the device kept for this user', async () => {
    kept('user-1', '2026-11-18');
    const { result } = await renderHook(() => useTermsAsk());
    // Before the server answered.
    expect(result.current?.version).toBe('2027-02-01');
  });

  it('keeps what the server says for the next start', async () => {
    const { result } = await renderHook(() => useTermsAsk());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(writeItem).toHaveBeenCalledWith(
      'terms-accepted',
      JSON.stringify({ userId: 'user-1', version: '2026-11-18' }),
    );
  });

  it('takes the server’s answer over the kept one, as after accepting on another phone', async () => {
    kept('user-1', '2026-11-18');
    accepted('2027-02-01');
    const { result } = await renderHook(() => useTermsAsk());
    await waitFor(() => expect(result.current).toBeNull());
  });

  it('opens the app when the server cannot be asked, whatever the device kept', async () => {
    kept('user-1', '2026-11-18');
    accepted(null, { code: '57014', message: 'timeout' });
    const { result } = await renderHook(() => useTermsAsk());
    // Shown from the kept version while the server is asked.
    expect(result.current).not.toBeNull();
    await waitFor(() => expect(result.current).toBeNull());
  });

  it('opens it at the first failed try, without waiting for the others', async () => {
    kept('user-1', '2026-11-18');
    accepted(null, { code: '57014', message: 'timeout' });
    const queryClient = createTestQueryClient();
    queryClient.setDefaultOptions({ queries: { retry: 3, retryDelay: 60_000 } });
    const { result } = await renderHook(() => useTermsAsk(), { queryClient });
    await waitFor(() => expect(supabase.from).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current).toBeNull());
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('does not go by what was kept for another user of the phone', async () => {
    kept('guest-1', '2026-11-18');
    accepted('2027-02-01');
    const { result } = await renderHook(() => useTermsAsk());
    expect(result.current).toBeNull();
    await waitFor(() => expect(supabase.from).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});

describe('Later', () => {
  it('puts the question off for the day, for this version', async () => {
    const queryClient = createTestQueryClient();
    const { result } = await renderHook(() => ({ ask: useTermsAsk(), putOff: usePutOffTerms() }), {
      queryClient,
    });
    await waitFor(() => expect(result.current.ask).not.toBeNull());

    await act(() => result.current.putOff('2027-02-01'));
    await waitFor(() => expect(result.current.ask).toBeNull());
    expect(writeItem).toHaveBeenCalledWith(
      'terms-put-off',
      JSON.stringify({ userId: 'user-1', version: '2027-02-01', day: '2027-02-10' }),
    );
  });

  it('stays put off the same day, and asks again the next', async () => {
    jest
      .mocked(readItem)
      .mockReturnValue(
        JSON.stringify({ userId: 'user-1', version: '2027-02-01', day: '2027-02-10' }),
      );
    const today = await renderHook(() => useTermsAsk());
    await waitFor(() => expect(supabase.from).toHaveBeenCalled());
    expect(today.result.current).toBeNull();

    jest.setSystemTime(new Date('2027-02-11T07:00:00'));
    const tomorrow = await renderHook(() => useTermsAsk());
    await waitFor(() => expect(tomorrow.result.current).not.toBeNull());
  });

  it('does not count for another user of the phone', async () => {
    jest
      .mocked(readItem)
      .mockReturnValue(
        JSON.stringify({ userId: 'guest-1', version: '2027-02-01', day: '2027-02-10' }),
      );
    const { result } = await renderHook(() => useTermsAsk());
    await waitFor(() => expect(result.current).not.toBeNull());
  });

  it('does not count for a later version, nor once the terms apply', async () => {
    jest
      .mocked(readItem)
      .mockReturnValue(
        JSON.stringify({ userId: 'user-1', version: '2026-12-01', day: '2027-02-10' }),
      );
    const other = await renderHook(() => useTermsAsk());
    await waitFor(() => expect(other.result.current).not.toBeNull());

    jest
      .mocked(readItem)
      .mockReturnValue(
        JSON.stringify({ userId: 'user-1', version: '2027-02-01', day: '2027-02-10' }),
      );
    jest.mocked(useAgreement).mockReturnValue({ ...TERMS, appliesAt: '2027-02-10T00:00:00+00:00' });
    const due = await renderHook(() => useTermsAsk());
    await waitFor(() => expect(due.result.current?.due).toBe(true));
  });
});

describe('accepting', () => {
  it('records the version and ends the question', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
    const queryClient = createTestQueryClient();
    const { result } = await renderHook(() => ({ ask: useTermsAsk(), accept: useAcceptTerms() }), {
      queryClient,
    });
    await waitFor(() => expect(result.current.ask).not.toBeNull());

    await act(() => result.current.accept.mutateAsync('2027-02-01'));
    expect(supabase.rpc).toHaveBeenCalledWith('accept_terms', { terms_version: '2027-02-01' });
    await waitFor(() => expect(result.current.ask).toBeNull());
    expect(writeItem).toHaveBeenCalledWith(
      'terms-accepted',
      JSON.stringify({ userId: 'user-1', version: '2027-02-01' }),
    );
  });

  it('is not undone by a read that was under way, answered before it', async () => {
    // The read of the start, which answers only after the user accepted.
    let answer: (value: unknown) => void = () => {};
    const sorted = {
      order: () => sorted,
      limit: () => new Promise((resolve) => (answer = resolve)),
    };
    jest.mocked(supabase.from).mockReturnValue({ select: () => sorted } as never);
    jest
      .mocked(readItem)
      .mockImplementation((key) =>
        key === 'terms-accepted'
          ? JSON.stringify({ userId: 'user-1', version: '2026-11-18' })
          : null,
      );
    jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
    const queryClient = createTestQueryClient();
    const { result } = await renderHook(() => ({ ask: useTermsAsk(), accept: useAcceptTerms() }), {
      queryClient,
    });
    expect(result.current.ask).not.toBeNull();

    await act(() => result.current.accept.mutateAsync('2027-02-01'));
    await act(() => answer({ data: [{ terms_version: '2026-11-18' }], error: null }));
    await waitFor(() => expect(result.current.ask).toBeNull());
    expect(jest.mocked(writeItem).mock.calls.at(-1)).toEqual([
      'terms-accepted',
      JSON.stringify({ userId: 'user-1', version: '2027-02-01' }),
    ]);
  });

  it('asks the server which terms are current when these were refused as not', async () => {
    const refusal = { code: 'BB065', message: 'These are not the current terms of use' };
    jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: refusal } as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(['requirements'], {});
    const { result } = await renderHook(() => useAcceptTerms(), { queryClient });

    await act(() => result.current.mutateAsync('2027-02-01').catch(() => {}));
    expect(queryClient.getQueryState(['requirements'])?.isInvalidated).toBe(true);
  });
});
