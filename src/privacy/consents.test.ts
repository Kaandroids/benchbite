import { supabase } from '@/lib/supabase';
import { useOnboarding } from '@/providers/onboarding-provider';
import { onboardingValue } from '@/test/context-mocks';
import { act, renderHook, waitFor } from '@/test/render';

import { useConsents, useWithdrawAiConsent, useWithdrawHealthConsent } from './consents';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@/providers/onboarding-provider', () => ({ useOnboarding: jest.fn() }));

/** Answers each table's latest row with `rows[table]`, none when it is not given. */
function tables(rows: Record<string, Record<string, string>>) {
  jest.mocked(supabase.from).mockImplementation((table: string) => {
    const query = {
      select: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: () => Promise.resolve({ data: rows[table] ?? null, error: null }),
    };
    return query as never;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useOnboarding).mockReturnValue(onboardingValue({ completed: true }));
});

it('says when each consent that holds was given', async () => {
  tables({
    health_data_consents: { granted_at: '2026-10-21T10:00:00Z' },
    ai_consents: { granted_at: '2026-11-18T10:00:00Z' },
  });
  const { result } = await renderHook(() => useConsents());
  await waitFor(() => expect(result.current.data).toBeDefined());
  expect(result.current.data).toEqual({
    health: new Date('2026-10-21T10:00:00Z'),
    ai: new Date('2026-11-18T10:00:00Z'),
  });
});

it('counts a consent withdrawn since as not given, and one given again as given', async () => {
  tables({
    health_data_consents: { granted_at: '2026-11-20T10:00:00Z' },
    health_data_consent_withdrawals: { withdrawn_at: '2026-11-19T10:00:00Z' },
    ai_consents: { granted_at: '2026-11-18T10:00:00Z' },
    ai_consent_withdrawals: { withdrawn_at: '2026-11-19T10:00:00Z' },
  });
  const { result } = await renderHook(() => useConsents());
  await waitFor(() => expect(result.current.data).toBeDefined());
  expect(result.current.data).toEqual({ health: new Date('2026-11-20T10:00:00Z'), ai: undefined });
});

it('withdraws the AI consent on the server', async () => {
  jest.mocked(supabase.rpc).mockResolvedValue({ error: null } as never);
  const { result } = await renderHook(() => useWithdrawAiConsent());
  await act(() => result.current.mutateAsync());
  expect(supabase.rpc).toHaveBeenCalledWith('withdraw_ai_consent');
});

it('starts the onboarding again once the health data consent is withdrawn', async () => {
  const restart = jest.fn();
  jest.mocked(useOnboarding).mockReturnValue(onboardingValue({ completed: true, restart }));
  jest.mocked(supabase.rpc).mockResolvedValue({ error: null } as never);
  const { result } = await renderHook(() => useWithdrawHealthConsent());
  await act(() => result.current.mutateAsync());
  expect(supabase.rpc).toHaveBeenCalledWith('withdraw_health_consent');
  expect(restart).toHaveBeenCalled();
});

it('keeps the onboarding when the withdrawal fails', async () => {
  const restart = jest.fn();
  jest.mocked(useOnboarding).mockReturnValue(onboardingValue({ completed: true, restart }));
  jest.mocked(supabase.rpc).mockResolvedValue({ error: new Error('offline') } as never);
  const { result } = await renderHook(() => useWithdrawHealthConsent());
  await act(() => result.current.mutateAsync().catch(() => {}));
  expect(restart).not.toHaveBeenCalled();
});
