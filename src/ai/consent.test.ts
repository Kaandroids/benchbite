import { supabase } from '@/lib/supabase';
import { useAgreementVersion } from '@/requirements/requirements';
import { act, createTestQueryClient, renderHook } from '@/test/render';

import { useGiveAiConsent } from './consent';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/privacy/consents', () => ({ CONSENTS_KEY: ['privacy', 'consents'] }));
jest.mock('@/requirements/requirements', () => ({
  REQUIREMENTS_KEY: ['requirements'],
  useAgreementVersion: jest.fn(),
}));
jest.mock('./access', () => ({ ACCESS_KEY: ['ai', 'access'] }));

const insert = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(supabase.from).mockReturnValue({ insert } as never);
  jest.mocked(useAgreementVersion).mockReturnValue('2026-11-18');
});

/** A client that holds an answer under each key, to see which are read again. */
function clientWith(...keys: string[][]) {
  const queryClient = createTestQueryClient();
  keys.forEach((key) => queryClient.setQueryData(key, {}));
  const stale = (key: string[]) => queryClient.getQueryState(key)?.isInvalidated;
  return { queryClient, stale };
}

it('records the consent to the current version, then reads access and the consents again', async () => {
  insert.mockResolvedValue({ error: null });
  const { queryClient, stale } = clientWith(['ai', 'access'], ['privacy', 'consents']);
  const { result } = await renderHook(() => useGiveAiConsent(), { queryClient });

  await act(() => result.current.mutateAsync());
  expect(supabase.from).toHaveBeenCalledWith('ai_consents');
  expect(insert).toHaveBeenCalledWith({ consent_version: '2026-11-18' });
  expect(stale(['ai', 'access'])).toBe(true);
  expect(stale(['privacy', 'consents'])).toBe(true);
});

it('asks the server which text is current when this one was refused as not', async () => {
  insert.mockResolvedValue({
    error: { code: 'BB066', message: 'This is not the current text of the consent' },
  });
  const { queryClient, stale } = clientWith(['requirements'], ['ai', 'access']);
  const { result } = await renderHook(() => useGiveAiConsent(), { queryClient });

  await act(() => result.current.mutateAsync().catch(() => {}));
  expect(stale(['requirements'])).toBe(true);
  expect(stale(['ai', 'access'])).toBe(false);
});
