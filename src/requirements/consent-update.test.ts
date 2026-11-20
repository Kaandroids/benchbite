import { readItem, writeItem } from '@/lib/device-storage';
import { supabase } from '@/lib/supabase';
import { useOnboarding } from '@/providers/onboarding-provider';
import { useSession, useUserId } from '@/providers/session-provider';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import { useConsentAsk, useGiveHealthConsent } from './consent-update';
import { useAgreement } from './requirements';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@/lib/device-storage', () => ({ readItem: jest.fn(), writeItem: jest.fn() }));
jest.mock('@/providers/session-provider', () => ({ useSession: jest.fn(), useUserId: jest.fn() }));
jest.mock('@/providers/onboarding-provider', () => ({ useOnboarding: jest.fn() }));
jest.mock('@/privacy/consents', () => ({ CONSENTS_KEY: ['privacy', 'consents'] }));
jest.mock('./requirements', () => ({
  REQUIREMENTS_KEY: ['requirements'],
  useAgreement: jest.fn(),
}));

/** The consent's text in a newer version. */
const TEXT = {
  version: '2027-02-01',
  appliesAt: '2027-03-03T00:00:00+00:00',
  summary: { en: 'Names your progress photos too' },
};

/** The server's history of the user's consents, whose latest version is `version`. */
function given(version: string | null, error: unknown = null) {
  const limit = jest
    .fn()
    .mockResolvedValue({ data: version ? [{ policy_version: version }] : [], error });
  const sorted = { order: () => sorted, limit };
  jest.mocked(supabase.from).mockReturnValue({ select: () => sorted } as never);
}
const restart = jest.fn();
const signedIn = (status = 'ready', completed = true) => {
  jest.mocked(useSession).mockReturnValue({ status } as never);
  jest.mocked(useUserId).mockReturnValue(status === 'ready' ? 'user-1' : undefined);
  jest.mocked(useOnboarding).mockReturnValue({ completed, restart } as never);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(readItem).mockReturnValue(null);
  jest.mocked(useAgreement).mockReturnValue(TEXT);
  signedIn();
  given('2026-10-21');
});

it('asks for a consent to a text other than the one consented to, saying what changed', async () => {
  const { result } = await renderHook(() => useConsentAsk());
  await waitFor(() => expect(result.current).not.toBeNull());
  expect(result.current).toEqual({
    version: '2027-02-01',
    summary: 'Names your progress photos too',
  });
  expect(useAgreement).toHaveBeenCalledWith('health_consent');
  expect(supabase.from).toHaveBeenCalledWith('health_data_consents');
});

it('asks at once from the version the device kept, and keeps what the server says', async () => {
  jest
    .mocked(readItem)
    .mockImplementation((key) =>
      key === 'health-consent-given'
        ? JSON.stringify({ userId: 'user-1', version: '2026-10-21' })
        : null,
    );
  const { result } = await renderHook(() => useConsentAsk());
  expect(result.current?.version).toBe('2027-02-01');
  await waitFor(() =>
    expect(writeItem).toHaveBeenCalledWith(
      'health-consent-given',
      JSON.stringify({ userId: 'user-1', version: '2026-10-21' }),
    ),
  );
});

it('asks nothing of a user who consented to the current text', async () => {
  given('2027-02-01');
  const { result } = await renderHook(() => useConsentAsk());
  await waitFor(() => expect(supabase.from).toHaveBeenCalled());
  expect(result.current).toBeNull();
});

it('asks nothing while it does not know: no answer of the server, or no history', async () => {
  jest.mocked(useAgreement).mockReturnValue(undefined);
  const unknown = await renderHook(() => useConsentAsk());
  expect(unknown.result.current).toBeNull();

  jest.mocked(useAgreement).mockReturnValue(TEXT);
  given(null, { code: '57014', message: 'timeout' });
  const failed = await renderHook(() => useConsentAsk());
  await waitFor(() => expect(supabase.from).toHaveBeenCalled());
  expect(failed.result.current).toBeNull();
});

it('asks nothing of a user without a consent, whom the onboarding asks', async () => {
  // A state no flow leaves behind, as a withdrawal keeps the history; the onboarding's to ask.
  given(null);
  const { result } = await renderHook(() => useConsentAsk());
  await waitFor(() => expect(supabase.from).toHaveBeenCalled());
  expect(result.current).toBeNull();
});

it('leaves the onboarding and a missing session alone, without reading the history', async () => {
  signedIn('ready', false);
  const onboarding = await renderHook(() => useConsentAsk());
  expect(onboarding.result.current).toBeNull();
  signedIn('ended');
  const ended = await renderHook(() => useConsentAsk());
  expect(ended.result.current).toBeNull();
  expect(supabase.from).not.toHaveBeenCalled();
});

describe('agreeing', () => {
  it('records the version, ends the question and reads the consents again', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(['privacy', 'consents'], {});
    const { result } = await renderHook(
      () => ({ ask: useConsentAsk(), give: useGiveHealthConsent() }),
      { queryClient },
    );
    await waitFor(() => expect(result.current.ask).not.toBeNull());

    await act(() => result.current.give.mutateAsync('2027-02-01'));
    expect(supabase.rpc).toHaveBeenCalledWith('give_health_consent', {
      policy_version: '2027-02-01',
    });
    await waitFor(() => expect(result.current.ask).toBeNull());
    expect(writeItem).toHaveBeenCalledWith(
      'health-consent-given',
      JSON.stringify({ userId: 'user-1', version: '2027-02-01' }),
    );
    expect(queryClient.getQueryState(['privacy', 'consents'])?.isInvalidated).toBe(true);
  });

  it('asks the server which text is current when this one was refused as not', async () => {
    const refusal = { code: 'BB066', message: 'This is not the current text of the consent' };
    jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: refusal } as never);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(['requirements'], {});
    const { result } = await renderHook(() => useGiveHealthConsent(), { queryClient });

    await act(() => result.current.mutateAsync('2027-02-01').catch(() => {}));
    expect(queryClient.getQueryState(['requirements'])?.isInvalidated).toBe(true);
    expect(restart).not.toHaveBeenCalled();
  });

  it('starts the onboarding again when the consent was withdrawn meanwhile, as elsewhere', async () => {
    const refusal = { code: 'BB062', message: 'There is no health data consent to renew' };
    jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: refusal } as never);
    const { result } = await renderHook(() => useGiveHealthConsent());

    await act(() => result.current.mutateAsync('2027-02-01').catch(() => {}));
    expect(restart).toHaveBeenCalledTimes(1);
  });
});
