import { createTestQueryClient } from '@/test/render';

import { reloadAfterPlanChange } from './reload';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('reloadAfterPlanChange', () => {
  it('loads again everything that depends on the plan', async () => {
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    await reloadAfterPlanChange(queryClient);
    for (const queryKey of [['workouts'], ['workout-limits'], ['ai', 'access'], ['plan-summary']]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
  });
});
