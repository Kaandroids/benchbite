import { router, useLocalSearchParams } from 'expo-router';
import { BackHandler } from 'react-native';

import { act, fireEvent, render, screen } from '@/test/render';
import { useLatestWeight, useWeightUnit } from '@/weight/weights';

import { useNutritionTargets, useRecalculateTargets, useTargetBasis } from '../targets';
import { openSave } from './building-step';
import { RecalculateScreen } from './recalculate-screen';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
const mockRedirect = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { back: jest.fn(), push: jest.fn(), dismissTo: jest.fn() },
    useLocalSearchParams: jest.fn(),
    // Runs once on mount, as the screen comes into focus.
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
    Redirect: ({ href }: { href: unknown }) => {
      mockRedirect(href);
      return null;
    },
    Stack: { Screen: () => null },
  };
});
jest.mock('../targets', () => ({
  ...jest.requireActual('../targets'),
  useTargetBasis: jest.fn(),
  useNutritionTargets: jest.fn(),
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
  jest.mocked(useRecalculateTargets).mockReturnValue({ mutateAsync: recalculate } as never);
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

  // A pace saved in the other unit lies between the slider's steps.
  it.each([
    ['kg', 0.68, '0.68'],
    ['lb', 0.55, '0.55'],
  ] as const)(
    'keeps a saved pace the slider rounds, in %s, until it moves',
    async (unit, kg, sent) => {
      jest.mocked(useWeightUnit).mockReturnValue(loaded(unit));
      open({ step: 'target', goal: 'lose_fat', target: '75', pace: String(kg), activity: 'light' });
      await render(<RecalculateScreen />);
      await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
      expect(router.push).toHaveBeenLastCalledWith(
        expect.objectContaining({ params: expect.objectContaining({ pace: sent }) }),
      );
    },
  );

  it('sends the pace from the slider once it moves', async () => {
    open({ step: 'target', goal: 'lose_fat', target: '75', pace: '0.68', activity: 'light' });
    await render(<RecalculateScreen />);
    await fireEvent(screen.getByRole('adjustable', { name: 'Pace' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(router.push).toHaveBeenLastCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ pace: '0.75' }) }),
    );
  });

  it('keeps Continue off for a target on the wrong side, without a pace', async () => {
    open({ step: 'target', goal: 'lose_fat', target: '79.5', pace: '0.5' });
    await render(<RecalculateScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Higher target' }));
    expect(
      screen.getByText('To lose fat, your target has to be below your current weight.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.queryByText('Pace')).toBeNull();
  });

  it('offers the lowest healthy target for one that is too low', async () => {
    open({ step: 'target', goal: 'lose_fat', target: '60', pace: '0.5' });
    await render(<RecalculateScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Lower target' }));
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
      params: { step: 'review', goal: 'lose_fat', target: '75', pace: '0.5', activity: 'active' },
    });
  });
});

describe('leaving', () => {
  it('closes the steps from any of them, back to the daily goals', async () => {
    open({ step: 'activity', goal: 'lose_fat', target: '75', pace: '0.5' });
    await render(<RecalculateScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(router.dismissTo).toHaveBeenCalledWith('/nutrition/goals');
  });

  it('names the last step Review, apart from the goal', async () => {
    open({ step: 'review' });
    await render(<RecalculateScreen />);
    expect(screen.getByRole('progressbar', { name: 'Review' })).toBeTruthy();
    expect(screen.getByText('Goal')).toBeTruthy();
  });
});

describe('the review step', () => {
  const params = {
    step: 'review',
    goal: 'build_muscle',
    target: '84',
    pace: '0.25',
    activity: 'active',
  };

  it('lists only what changed, each against its saved value', async () => {
    open({ step: 'review', goal: 'lose_fat', target: '75', pace: '0.5', activity: 'active' });
    await render(<RecalculateScreen />);
    expect(screen.getByLabelText('Activity: Very active, was Lightly active')).toBeTruthy();
    expect(screen.queryByLabelText(/^Goal/)).toBeNull();
    expect(screen.queryByLabelText(/^Target weight/)).toBeNull();
    expect(screen.queryByLabelText(/^Pace/)).toBeNull();
  });

  it('lists every answer that changed with a new goal', async () => {
    open(params);
    await render(<RecalculateScreen />);
    expect(screen.getByLabelText('Goal: Build muscle, was Lose fat')).toBeTruthy();
    expect(screen.getByLabelText('Target weight: 84 kg, was 75 kg')).toBeTruthy();
    expect(screen.getByLabelText('Pace: 0.25 kg a week, was 0.5 kg a week')).toBeTruthy();
    expect(screen.getByText('Your workout plan stays as it is.')).toBeTruthy();
  });

  it('keeps the button off when nothing changed', async () => {
    open({ step: 'review' });
    await render(<RecalculateScreen />);
    expect(screen.getByText(/You have not changed anything yet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Calculate my goals' })).toBeDisabled();
  });

  it('saves nothing itself, and opens the save with the answers and the goals in use', async () => {
    open(params);
    await render(<RecalculateScreen />);
    const calculate = screen.getByRole('button', { name: 'Calculate my goals' });
    await fireEvent.press(calculate);
    // A double tap opens one save.
    await fireEvent.press(calculate);
    expect(recalculate).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/nutrition/recalculate/[step]',
      params: {
        step: 'building',
        goal: 'build_muscle',
        target: '84',
        pace: '0.25',
        activity: 'active',
        was: '1940,135,229,54',
        save: expect.any(String),
      },
    });
  });
});

describe('the save', () => {
  const answers = {
    goal: 'build_muscle',
    targetWeightKg: 84,
    weeklyPaceKg: 0.25,
    activity: 'active',
  } as const;

  /** Opens the save as the review does, and returns its parameters. */
  const openFromReview = (opened: Parameters<typeof openSave>[0] = answers) => {
    openSave(opened, '1940,135,229,54');
    const { params } = jest.mocked(router.push).mock.calls.at(-1)![0] as {
      params: Record<string, string>;
    };
    jest.mocked(router.push).mockClear();
    open(params);
    return params;
  };
  const advance = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));
  const seeMyGoals = () => screen.queryByRole('button', { name: 'See my goals' });

  it('saves the answers while a line about the goals shows at a time', async () => {
    recalculate.mockResolvedValue(undefined);
    openFromReview();
    await render(<RecalculateScreen />);
    expect(recalculate).toHaveBeenCalledWith({
      goal: 'build_muscle',
      targetWeightKg: 84,
      weeklyPaceKg: 0.25,
      activity: 'active',
    });
    expect(screen.getByText('Goal: Build muscle')).toBeTruthy();
    await advance(1100);
    expect(screen.getByText('Gaining 0.25 kg a week, from 80 kg')).toBeTruthy();
    await advance(1100);
    expect(screen.getByText('Activity: Very active')).toBeTruthy();
    await advance(1100);
    expect(screen.getByText('Calories and macros for each day')).toBeTruthy();
    expect(seeMyGoals()).toBeNull();

    await advance(1500);
    expect(screen.getByText('Your new goals are ready')).toBeTruthy();
    // It waits for the user rather than moving on by itself.
    expect(router.push).not.toHaveBeenCalled();
    await fireEvent.press(seeMyGoals()!);
    expect(router.dismissTo).toHaveBeenCalledWith('/nutrition/goals');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/nutrition/recalculate/[step]',
      params: { step: 'done', was: '1940,135,229,54' },
    });
  });

  it('says the weight stays for a goal that keeps it', async () => {
    recalculate.mockResolvedValue(undefined);
    openFromReview({
      goal: 'get_stronger',
      targetWeightKg: null,
      weeklyPaceKg: null,
      activity: 'light',
    });
    await render(<RecalculateScreen />);
    await advance(1100);
    expect(screen.getByText('Keeping your weight at 80 kg')).toBeTruthy();
  });

  it('opens the review instead for a link, or when nothing changed', async () => {
    open({
      step: 'building',
      goal: 'build_muscle',
      target: '84',
      pace: '0.25',
      activity: 'active',
    });
    await render(<RecalculateScreen />);
    open({ ...openFromReview(), save: 'guessed' });
    await render(<RecalculateScreen />);
    openFromReview({ goal: 'lose_fat', targetWeightKg: 75, weeklyPaceKg: 0.5, activity: 'light' });
    await render(<RecalculateScreen />);
    expect(recalculate).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledTimes(3);
    expect(mockRedirect).toHaveBeenLastCalledWith({
      pathname: '/nutrition/recalculate/[step]',
      params: { step: 'review', goal: 'lose_fat', activity: 'light', target: '75', pace: '0.5' },
    });
  });

  it('cannot be left while saving, and offers to try again or go back on failure', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    let hardwareBack = () => false as boolean | null | undefined;
    const backHandler = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        hardwareBack = () => handler({} as never);
        return { remove: jest.fn() };
      });
    recalculate.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    openFromReview();
    await render(<RecalculateScreen />);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    // Android's back button does nothing while saving.
    expect(hardwareBack()).toBe(true);

    await advance(4400);
    expect(screen.getByText(/The goals could not be saved/)).toBeTruthy();
    expect(seeMyGoals()).toBeNull();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(hardwareBack()).toBe(false);

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(recalculate).toHaveBeenCalledTimes(2);
    await advance(5000);
    expect(seeMyGoals()).toBeTruthy();
    backHandler.mockRestore();
    warn.mockRestore();
  });
});

describe('the page after saving', () => {
  beforeEach(() =>
    jest
      .mocked(useNutritionTargets)
      .mockReturnValue(loaded({ calories: 3400, proteinG: 180, carbsG: 430, fatG: 70 })),
  );

  it('shows the new goals against the ones before', async () => {
    open({ step: 'done', was: '2500,150,300,70' });
    await render(<RecalculateScreen />);
    expect(screen.getByText('Your new daily goals')).toBeTruthy();
    expect(screen.getByLabelText('Calories: 3,400 kcal, was 2,500 kcal')).toBeTruthy();
    expect(screen.getByLabelText('Protein: 180 g, was 150 g')).toBeTruthy();
    expect(screen.getByLabelText('Fat: 70 g')).toBeTruthy();
  });

  it('shows the new goals alone without the ones before', async () => {
    open({ step: 'done', was: 'nonsense' });
    await render(<RecalculateScreen />);
    expect(screen.getByLabelText('Calories: 3,400 kcal')).toBeTruthy();
  });

  it('goes back to the Nutrition tab when done', async () => {
    open({ step: 'done', was: '2500,150,300,70' });
    await render(<RecalculateScreen />);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(router.dismissTo).toHaveBeenCalledWith('/nutrition');
  });
});
