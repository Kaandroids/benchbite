import { useIsAccount } from '@/providers/session-provider';
import { supabase } from '@/lib/supabase';
import { createTestQueryClient, fireEvent, render, screen, waitFor } from '@/test/render';

import { DevPlanSection } from './dev-plan-section';

jest.mock('@/providers/session-provider', () => ({ useIsAccount: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

const maybeSingle = jest.fn();
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

/** The account is on `plan`, and dev_set_plan() answers with `refusal`, if any. */
function onPlan(plan: 'free' | 'trial' | 'premium', refusal?: { code: string; message: string }) {
  maybeSingle.mockResolvedValue({ data: plan === 'free' ? null : { plan }, error: null });
  jest
    .mocked(supabase.rpc)
    .mockImplementation(((name: string) =>
      Promise.resolve(
        name === 'has_premium'
          ? { data: plan !== 'free', error: null }
          : { data: null, error: refusal ?? null },
      )) as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  jest.mocked(useIsAccount).mockReturnValue(true);
  jest.mocked(supabase.from).mockReturnValue({ select: () => ({ maybeSingle }) } as never);
  onPlan('trial');
});
afterAll(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = URL;
});

describe('DevPlanSection', () => {
  it('shows the plan the account is on', async () => {
    await render(<DevPlanSection />);
    expect(await screen.findByRole('radio', { name: 'Trial', checked: true })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Free', checked: false })).toBeTruthy();
  });

  it('shows free without premium, whatever the subscription says', async () => {
    onPlan('free');
    await render(<DevPlanSection />);
    expect(await screen.findByRole('radio', { name: 'Free', checked: true })).toBeTruthy();
  });

  it('switches the plan and loads again what depends on it', async () => {
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    await render(<DevPlanSection />, { queryClient });
    await fireEvent.press(await screen.findByRole('radio', { name: 'Premium' }));
    expect(supabase.rpc).toHaveBeenCalledWith('dev_set_plan', { plan: 'premium' });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dev-plan'] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workouts'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workout-limits'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['ai', 'access'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['plan-summary'] });
  });

  it('says how to turn the developer tools on when the database refuses', async () => {
    onPlan('trial', { code: 'BB053', message: 'The developer tools are off on this database' });
    await render(<DevPlanSection />);
    await fireEvent.press(await screen.findByRole('radio', { name: 'Free' }));
    expect(await screen.findByText(/pnpm vault:local/)).toBeTruthy();
  });

  it('is not there for a guest', async () => {
    jest.mocked(useIsAccount).mockReturnValue(false);
    await render(<DevPlanSection />);
    expect(screen.queryByText('PLAN')).toBeNull();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('is not there against a hosted project', async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcdefgh.supabase.co';
    await render(<DevPlanSection />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
