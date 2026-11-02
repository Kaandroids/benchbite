import { supabase } from '@/lib/supabase';
import { renderHook, waitFor } from '@/test/render';

import { useAiAccess } from './access';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

beforeEach(() => {
  jest.mocked(supabase.rpc).mockResolvedValue({
    data: { allowed: false, reason: 'limit_reached', resets_at: '2026-11-09T00:00:00Z' },
    error: null,
  } as never);
});

it("asks for Bite's chat by default", async () => {
  const { result } = await renderHook(() => useAiAccess());

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(supabase.rpc).toHaveBeenCalledWith('ai_access', { feature: 'coach_chat' });
});

it('asks for the feature given, with when its window opens again', async () => {
  const { result } = await renderHook(() => useAiAccess('meal_photo'));

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(supabase.rpc).toHaveBeenCalledWith('ai_access', { feature: 'meal_photo' });
  expect(result.current.data).toEqual({
    refusal: 'limit_reached',
    resetsAt: new Date('2026-11-09T00:00:00Z'),
  });
});
