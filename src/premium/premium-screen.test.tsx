import { router } from 'expo-router';
import { Alert, Linking } from 'react-native';

import { fireEvent, render, screen, waitFor } from '@/test/render';

import { usePlanNumbers, usePlanSummary, type PlanSummary } from './plan';
import { PremiumScreen } from './premium-screen';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('./plan', () => ({
  ...jest.requireActual<typeof import('./plan')>('./plan'),
  usePlanSummary: jest.fn(),
  usePlanNumbers: jest.fn(),
}));

// A Monday, so that the next week starts on one.
const MONDAY = new Date(2026, 10, 9, 9, 0);

const FREE: PlanSummary = {
  plan: 'free',
  accountRequired: false,
  hadTrial: false,
  photos: { perWeek: 2, left: 1, resetsAt: MONDAY },
};
const PREMIUM: PlanSummary = {
  plan: 'premium',
  billing: 'yearly',
  renewsAt: new Date(2027, 10, 2),
  week: { left: 0.64, resetsAt: MONDAY },
  period: { left: 0.82, resetsAt: new Date(2026, 11, 2) },
};

const loaded = (data: unknown) => ({ data, isPending: false, isError: false, isFetching: false });

function mockPlan(summary: PlanSummary) {
  jest.mocked(usePlanSummary).mockReturnValue(loaded(summary) as never);
  jest.mocked(usePlanNumbers).mockReturnValue(
    loaded({
      free: { workouts: 3, versions: 2, addedAlternatives: 1, weeklyPhotos: 2 },
      premium: { workouts: 500, versions: 5, addedAlternatives: null, weeklyPhotos: null },
    }) as never,
  );
}

const onClose = jest.fn();

// A Wednesday before the Monday the week starts again, so that the day reads as a weekday.
const WEDNESDAY = new Date(2026, 10, 4, 9, 0);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: WEDNESDAY, advanceTimers: true });
});
afterEach(() => jest.useRealTimers());

describe('PremiumScreen', () => {
  it('shows a free user their photos this week and the free plan beside premium', async () => {
    mockPlan(FREE);
    await render(<PremiumScreen onClose={onClose} />);
    expect(screen.getByText('Train and eat with Bite')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();
    expect(screen.getByText('1 left · new ones on Monday')).toBeTruthy();
    expect(screen.getByLabelText('Workouts: free, 3; premium, 500')).toBeTruthy();
    expect(
      screen.getByLabelText('Chat and voice with Bite: free, Not included; premium, Included'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Alternatives: free, 1 in all; premium, 5 each')).toBeTruthy();
    expect(screen.getByText('Then from €6.99 a month. Cancel anytime.')).toBeTruthy();
  });

  it('says the archive comes with premium', async () => {
    mockPlan(FREE);
    await render(<PremiumScreen onClose={onClose} />);
    expect(
      screen.getByLabelText('Archive: free, Not included; premium, Included'),
    ).toBeOnTheScreen();
  });

  it('opens the plans, whose purchase waits until purchases open', async () => {
    mockPlan(FREE);
    await render(<PremiumScreen onClose={onClose} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Try 7 days free' }));
    expect(screen.getByText('Pick a plan, try it free')).toBeTruthy();
    expect(screen.getByRole('radio', { checked: true })).toHaveTextContent(/€83\.88/);
    expect(screen.getByRole('button', { name: 'Start 7 days free' })).toBeDisabled();
    expect(screen.getByText('Purchases open soon')).toBeTruthy();
    expect(screen.getByText(/After 7 days, €83\.88 a year/)).toBeTruthy();

    await fireEvent.press(screen.getByRole('radio', { name: /Monthly/ }));
    expect(screen.getByText(/After 7 days, €8\.99 a month/)).toBeTruthy();
  });

  it('asks a guest for an account before the plans, without their photos', async () => {
    mockPlan({ ...FREE, accountRequired: true });
    await render(<PremiumScreen onClose={onClose} />);
    expect(screen.queryByText('Meal photos this week')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Try 7 days free' }));
    expect(screen.queryByText('Pick a plan, try it free')).toBeNull();
    expect(screen.getByText('First, keep your progress safe')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/account/create'));
  });

  it('offers premium without a trial to a user who has had it', async () => {
    mockPlan({ ...FREE, hadTrial: true });
    await render(<PremiumScreen onClose={onClose} />);
    expect(screen.queryByText('Try 7 days free')).toBeNull();
    expect(screen.getByText('From €6.99 a month. Cancel anytime.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Get premium' }));
    expect(screen.getByText('Pick a plan')).toBeTruthy();
    expect(screen.queryByText(/Nothing due today/)).toBeNull();
    expect(screen.getByText(/^€83\.88 a year/)).toBeTruthy();
  });

  it('says restoring opens with the purchases', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    mockPlan(FREE);
    await render(<PremiumScreen onClose={onClose} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Restore' }));
    expect(alert).toHaveBeenCalledWith('Premium is on its way', expect.any(String));
  });

  it('shows a premium user their plan and Bite left as shares, and where to manage it', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    mockPlan(PREMIUM);
    await render(<PremiumScreen onClose={onClose} />);
    expect(screen.getByText('You have premium')).toBeTruthy();
    expect(screen.queryByText('Try 7 days free')).toBeNull();
    // No comparison for those who have it.
    expect(screen.queryByText('Workouts')).toBeNull();
    expect(screen.getByText('Renews November 2')).toBeTruthy();
    expect(screen.getByText('64%')).toBeTruthy();
    expect(screen.getByText('82%')).toBeTruthy();
    expect(screen.getByText('A new week on Monday')).toBeTruthy();
    expect(screen.getByText('Starts again on December 2')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: /^Manage subscription/ }));
    expect(openURL).toHaveBeenCalledWith(expect.stringContaining('subscriptions'));
    await fireEvent.press(screen.getByRole('button', { name: /^Change plan/ }));
    expect(screen.getByText('Pick a plan')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Get premium' })).toBeDisabled();
  });

  it('starts a change of plan from the one the user is on', async () => {
    mockPlan({ ...PREMIUM, billing: 'monthly' });
    await render(<PremiumScreen onClose={onClose} />);
    await fireEvent.press(screen.getByRole('button', { name: /^Change plan/ }));
    expect(screen.getByRole('radio', { checked: true })).toHaveTextContent(/€8\.99/);
  });

  it('names the trial as such, with its one window and when it ends', async () => {
    mockPlan({ ...PREMIUM, plan: 'trial', billing: 'monthly', week: null });
    await render(<PremiumScreen onClose={onClose} />);
    expect(screen.getByText('Your free week')).toBeTruthy();
    expect(screen.getByText('Ends November 2')).toBeTruthy();
    expect(screen.getByText('This trial')).toBeTruthy();
    expect(screen.queryByText('This week')).toBeNull();
  });

  it('says no date that has passed while the plan is in its grace', async () => {
    mockPlan({
      ...PREMIUM,
      renewsAt: null,
      week: { left: 0.64, resetsAt: null },
      period: { left: 0.82, resetsAt: null },
    });
    await render(<PremiumScreen onClose={onClose} />);
    expect(screen.getByText('82%')).toBeTruthy();
    expect(screen.queryByText(/^Renews/)).toBeNull();
    expect(screen.queryByText(/^Starts again/)).toBeNull();
    expect(screen.queryByText(/^A new week/)).toBeNull();
  });

  it('closes', async () => {
    mockPlan(FREE);
    await render(<PremiumScreen onClose={onClose} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
