import { supabase } from '@/lib/supabase';
import { useOnboarding } from '@/providers/onboarding-provider';
import { onboardingValue } from '@/test/context-mocks';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import { useConsents, useWithdrawAiConsent, useWithdrawHealthConsent } from './consents';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/providers/onboarding-provider', () => ({ useOnboarding: jest.fn() }));

/** Answers my_consents() with `row`, and the withdrawals with `error`. */
function server(row: object, error: unknown = null) {
  jest
    .mocked(supabase.rpc)
    .mockImplementation(((name: string) =>
      name === 'my_consents'
        ? { single: () => Promise.resolve({ data: row, error: null }) }
        : Promise.resolve({ error })) as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useOnboarding).mockReturnValue(onboardingValue({ completed: true }));
});

it('says when each consent that holds was given, as the server says', async () => {
  server({ health_given_at: '2026-10-21T10:00:00Z', ai_given_at: null });
  const { result } = await renderHook(() => useConsents());
  await waitFor(() => expect(result.current.data).toBeDefined());
  expect(supabase.rpc).toHaveBeenCalledWith('my_consents');
  expect(result.current.data).toEqual({ health: new Date('2026-10-21T10:00:00Z'), ai: undefined });
});

it('withdraws the AI consent on the server, then reads everything again', async () => {
  server({});
  const queryClient = createTestQueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const { result } = await renderHook(() => useWithdrawAiConsent(), { queryClient });
  await act(() => result.current.mutateAsync());
  expect(supabase.rpc).toHaveBeenCalledWith('withdraw_ai_consent');
  expect(invalidate).toHaveBeenCalledWith();
});

it('counts an AI consent withdrawn already, as on another phone, as withdrawn', async () => {
  server({}, { code: 'BB060', message: 'There is no AI consent to withdraw' });
  const { result } = await renderHook(() => useWithdrawAiConsent());
  await act(() => result.current.mutateAsync());
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});

it('starts again when the health data consent was withdrawn already', async () => {
  const restart = jest.fn();
  jest.mocked(useOnboarding).mockReturnValue(onboardingValue({ completed: true, restart }));
  server({}, { code: 'BB062', message: 'There is no health data consent to withdraw' });
  const { result } = await renderHook(() => useWithdrawHealthConsent());
  await act(() => result.current.mutateAsync());
  expect(restart).toHaveBeenCalled();
});

it('starts the onboarding again once the health data consent is withdrawn', async () => {
  const restart = jest.fn();
  jest.mocked(useOnboarding).mockReturnValue(onboardingValue({ completed: true, restart }));
  server({});
  const { result } = await renderHook(() => useWithdrawHealthConsent());
  await act(() => result.current.mutateAsync());
  expect(supabase.rpc).toHaveBeenCalledWith('withdraw_health_consent');
  expect(restart).toHaveBeenCalled();
});

it('keeps the onboarding when the withdrawal fails', async () => {
  const restart = jest.fn();
  jest.mocked(useOnboarding).mockReturnValue(onboardingValue({ completed: true, restart }));
  server({}, new Error('offline'));
  const { result } = await renderHook(() => useWithdrawHealthConsent());
  await act(() => result.current.mutateAsync().catch(() => {}));
  expect(restart).not.toHaveBeenCalled();
});
