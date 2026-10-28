import { router, useLocalSearchParams } from 'expo-router';

import { fireEvent, render, screen } from '@/test/render';
import { useLatestWeight, useWeightUnit } from '@/weight/weights';

import { RecalculateScreen } from './recalculate-screen';
import {
  useNutritionTargets,
  usePreviewTargets,
  useRecalculateTargets,
  useTargetBasis,
} from './targets';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('./targets', () => ({
  ...jest.requireActual('./targets'),
  useTargetBasis: jest.fn(),
  useNutritionTargets: jest.fn(),
  usePreviewTargets: jest.fn(),
  useRecalculateTargets: jest.fn(),
}));
jest.mock('@/weight/weights', () => ({ useLatestWeight: jest.fn(), useWeightUnit: jest.fn() }));

const loaded = <T,>(data: T) =>
  ({ data, isPending: false, isError: false, isFetching: false, refetch: jest.fn() }) as never;

const recalculate = jest.fn();

/** Opens a step with the answers so far. */
const open = (params: Record<string, string>) =>
  jest.mocked(useLocalSearchParams).mockReturnValue(params);

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 9, 28, 12), doNotFake: ['nextTick'] });
  jest.clearAllMocks();
  // Saved: losing fat from 80 to 75 kg at 0.5 kg a week, lightly active, 180 cm tall.
  jest.mocked(useTargetBasis).mockReturnValue(
    loaded({
      goal: 'lose_fat',
      targetWeightKg: 75,
      weeklyPaceKg: 0.5,
      activity: 'light',
      heightCm: 180,
    }),
  );
  jest.mocked(useLatestWeight).mockReturnValue(loaded({ weightKg: 80, measuredOn: '2026-10-28' }));
  jest.mocked(useWeightUnit).mockReturnValue(loaded('kg'));
  jest
    .mocked(useNutritionTargets)
    .mockReturnValue(loaded({ calories: 1940, proteinG: 135, carbsG: 229, fatG: 54 }));
  jest
    .mocked(usePreviewTargets)
    .mockReturnValue(loaded({ calories: 2050, proteinG: 135, carbsG: 246, fatG: 57 }));
  jest
    .mocked(useRecalculateTargets)
    .mockReturnValue({ mutate: recalculate, isPending: false, isError: false } as never);
});
afterEach(() => jest.useRealTimers());

describe('the goal step', () => {
  it('starts from the saved goal and keeps its target and pace', async () => {
    open({ step: 'goal' });
    await render(<RecalculateScreen />);
    expect(screen.getByRole('radio', { name: /Lose fat/ })).toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/nutrition/recalculate/[step]',
      params: { step: 'target', goal: 'lose_fat', target: '75', pace: '0.5', activity: 'light' },
    });
  });

  it('skips the target and pace for a goal that keeps the weight', async () => {
    open({ step: 'goal' });
    await render(<RecalculateScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: /Stay healthy/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/nutrition/recalculate/[step]',
      params: { step: 'activity', goal: 'stay_healthy', activity: 'light' },
    });
  });

  it('asks for a new target for another goal that changes the weight', async () => {
    open({ step: 'goal' });
    await render(<RecalculateScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: /Build muscle/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/nutrition/recalculate/[step]',
      params: { step: 'target', goal: 'build_muscle', activity: 'light' },
    });
  });

  it('shows the steps of the goal in the progress', async () => {
    open({ step: 'activity', goal: 'stay_healthy' });
    await render(<RecalculateScreen />);
    expect(screen.getByRole('progressbar', { name: 'Activity' })).toBeTruthy();
    expect(screen.queryByText('Target')).toBeNull();
  });
});

describe('the target step', () => {
  it('changes the target and the pace, and carries them on', async () => {
    open({ step: 'target', goal: 'lose_fat', target: '75', pace: '0.5', activity: 'light' });
    await render(<RecalculateScreen />);
    expect(screen.getByText('You weigh 80 kg now, from your latest weight.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Lower target' }));
    expect(screen.getByText('−5.5 kg from now')).toBeTruthy();
    expect(screen.getByText('Ideal: steady and sustainable')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/nutrition/recalculate/[step]',
      params: {
        step: 'activity',
        goal: 'lose_fat',
        target: '74.5',
        pace: '0.5',
        activity: 'light',
      },
    });
  });

  it("starts a new target a few kilograms in the goal's direction", async () => {
    open({ step: 'target', goal: 'build_muscle' });
    await render(<RecalculateScreen />);
    expect(screen.getByText('+3 kg from now')).toBeTruthy();
    expect(screen.getByText('0.25 kg per week')).toBeTruthy();
  });

  it('steps a pound at a time in pounds', async () => {
    jest.mocked(useWeightUnit).mockReturnValue(loaded('lb'));
    open({ step: 'target', goal: 'lose_fat', target: '75', pace: '0.5' });
    await render(<RecalculateScreen />);
    expect(screen.getByText(/^165\.3/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Higher target' }));
    expect(screen.getByText(/^166\.3/)).toBeTruthy();
  });

  it('keeps Continue off for a target on the wrong side, without a pace', async () => {
    open({ step: 'target', goal: 'lose_fat', target: '80.5' });
    await render(<RecalculateScreen />);
    expect(
      screen.getByText('To lose fat, your target has to be below your current weight.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.queryByText('Pace')).toBeNull();
  });

  it('offers the lowest healthy target for one that is too low', async () => {
    open({ step: 'target', goal: 'lose_fat', target: '59' });
    await render(<RecalculateScreen />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Make 60 kg my target' }));
    expect(screen.getByText('−20 kg from now')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('sends someone at the lower end of a healthy weight back to the goals', async () => {
    jest
      .mocked(useLatestWeight)
      .mockReturnValue(loaded({ weightKg: 59.5, measuredOn: '2026-10-28' }));
    open({ step: 'target', goal: 'lose_fat' });
    await render(<RecalculateScreen />);
    expect(screen.getByText(/already at the lower end of a healthy range/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose another goal' }));
    expect(router.back).toHaveBeenCalled();
  });
});

describe('the activity step', () => {
  it('starts from the saved activity and carries the new one on', async () => {
    open({ step: 'activity', goal: 'lose_fat', target: '75', pace: '0.5' });
    await render(<RecalculateScreen />);
    expect(screen.getByRole('radio', { name: /Lightly active/ })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: /Very active/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/nutrition/recalculate/[step]',
      params: { step: 'result', goal: 'lose_fat', target: '75', pace: '0.5', activity: 'active' },
    });
  });
});

describe('the result step', () => {
  const params = {
    step: 'result',
    goal: 'lose_fat',
    target: '75',
    pace: '0.5',
    activity: 'active',
  };

  it('shows the new goals against the ones in use', async () => {
    open(params);
    await render(<RecalculateScreen />);
    expect(usePreviewTargets).toHaveBeenCalledWith({
      goal: 'lose_fat',
      targetWeightKg: 75,
      weeklyPaceKg: 0.5,
      activity: 'active',
    });
    expect(screen.getByLabelText('Calories: 2,050 kcal, was 1,940 kcal')).toBeTruthy();
    expect(screen.getByLabelText('Protein: 135 g')).toBeTruthy();
    expect(screen.getByLabelText('Carbs: 246 g, was 229 g')).toBeTruthy();
  });

  it('saves them and goes back to the goals', async () => {
    open(params);
    await render(<RecalculateScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Use these goals' }));
    expect(recalculate).toHaveBeenCalledWith(
      { goal: 'lose_fat', targetWeightKg: 75, weeklyPaceKg: 0.5, activity: 'active' },
      expect.anything(),
    );
    recalculate.mock.calls[0][1].onSuccess();
    expect(router.dismissTo).toHaveBeenCalledWith('/nutrition/goals');
  });

  it('says when they could not be saved', async () => {
    jest
      .mocked(useRecalculateTargets)
      .mockReturnValue({ mutate: recalculate, isPending: false, isError: true } as never);
    open(params);
    await render(<RecalculateScreen />);
    expect(screen.getByText(/The goals could not be saved/)).toBeTruthy();
  });

  it('keeps the button off until the new goals are worked out', async () => {
    jest.mocked(usePreviewTargets).mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      isFetching: true,
      refetch: jest.fn(),
    } as never);
    open(params);
    await render(<RecalculateScreen />);
    expect(screen.getByRole('button', { name: 'Use these goals' })).toBeDisabled();
  });
});
