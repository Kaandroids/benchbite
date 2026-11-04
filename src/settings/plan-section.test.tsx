import { router } from 'expo-router';

import { fireEvent, render, screen } from '@/test/render';
import { usePlanSummary, type PlanSummary } from '@/premium/plan';

import { PlanSection } from './plan-section';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/premium/plan', () => ({
  ...jest.requireActual<typeof import('@/premium/plan')>('@/premium/plan'),
  usePlanSummary: jest.fn(),
}));

const FREE: PlanSummary = {
  plan: 'free',
  accountRequired: false,
  hadTrial: false,
  photos: { perWeek: 2, left: 1, resetsAt: new Date(2026, 10, 9) },
};
const PREMIUM: PlanSummary = {
  plan: 'premium',
  billing: 'yearly',
  renewsAt: new Date(2027, 10, 2),
  week: { left: 0.64, resetsAt: new Date(2026, 10, 9) },
  period: { left: 0.82, resetsAt: new Date(2026, 11, 2) },
};

function mockPlan(data: PlanSummary | undefined) {
  jest.mocked(usePlanSummary).mockReturnValue({ data } as never);
}

beforeEach(() => jest.clearAllMocks());

describe('PlanSection', () => {
  it('offers the trial on the free plan, and opens premium', async () => {
    mockPlan(FREE);
    await render(<PlanSection />);
    expect(screen.getByText('Free plan')).toBeTruthy();
    expect(screen.getByText('Try premium free for 7 days')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Free plan/ }));
    expect(router.push).toHaveBeenCalledWith('/premium');
  });

  it('offers premium without the trial to a user who has had it', async () => {
    mockPlan({ ...FREE, hadTrial: true });
    await render(<PlanSection />);
    expect(screen.queryByText(/Try premium free/)).toBeNull();
    expect(screen.getByText('Chat with Bite, and more')).toBeTruthy();
  });

  it('shows premium with its billing and when it renews', async () => {
    mockPlan(PREMIUM);
    await render(<PlanSection />);
    expect(screen.getByText('Premium')).toBeTruthy();
    expect(screen.getByText('Yearly · Renews November 2')).toBeTruthy();
  });

  it('shows when the trial ends, and no date in the plan’s grace', async () => {
    mockPlan({ ...PREMIUM, plan: 'trial', billing: 'monthly', week: null });
    const { rerender } = await render(<PlanSection />);
    expect(screen.getByText('Free trial')).toBeTruthy();
    expect(screen.getByText('Monthly · Ends November 2')).toBeTruthy();

    mockPlan({ ...PREMIUM, renewsAt: null });
    await rerender(<PlanSection />);
    expect(screen.getByText('Yearly')).toBeTruthy();
  });

  it('shows nothing until the plan has loaded', async () => {
    mockPlan(undefined);
    await render(<PlanSection />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
