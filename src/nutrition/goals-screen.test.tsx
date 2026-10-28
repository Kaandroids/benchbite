import { router } from 'expo-router';

import { fireEvent, render, screen } from '@/test/render';
import { useLatestWeight, useWeightUnit } from '@/weight/weights';

import { GoalsScreen } from './goals-screen';
import {
  useCalculatedTargets,
  useOwnTargets,
  useSetOwnTargets,
  useTargetBasis,
  useUseCalculatedTargets,
} from './targets';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('./targets', () => ({
  ...jest.requireActual('./targets'),
  useCalculatedTargets: jest.fn(),
  useOwnTargets: jest.fn(),
  useTargetBasis: jest.fn(),
  useSetOwnTargets: jest.fn(),
  useUseCalculatedTargets: jest.fn(),
}));
jest.mock('@/weight/weights', () => ({ useLatestWeight: jest.fn(), useWeightUnit: jest.fn() }));

const loaded = <T,>(data: T) =>
  ({ data, isPending: false, isError: false, isFetching: false, refetch: jest.fn() }) as never;

const setOwn = jest.fn();
const useCalculated = jest.fn();

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 9, 28, 12), doNotFake: ['nextTick'] });
  jest.clearAllMocks();
  // A test below makes the switch fail; the others start from a plain one.
  useCalculated.mockReset();
  jest
    .mocked(useCalculatedTargets)
    .mockReturnValue(loaded({ calories: 1940, proteinG: 135, carbsG: 229, fatG: 54 }));
  jest.mocked(useOwnTargets).mockReturnValue(loaded(null));
  jest
    .mocked(useTargetBasis)
    .mockReturnValue(
      loaded({ goal: 'lose_fat', targetWeightKg: 75, weeklyPaceKg: 0.5, activity: 'light' }),
    );
  jest.mocked(useLatestWeight).mockReturnValue(loaded({ weightKg: 80, measuredOn: '2026-10-28' }));
  jest.mocked(useWeightUnit).mockReturnValue(loaded('kg'));
  jest.mocked(useSetOwnTargets).mockReturnValue({ mutate: setOwn, isPending: false } as never);
  jest.mocked(useUseCalculatedTargets).mockReturnValue({ mutate: useCalculated } as never);
});
afterEach(() => jest.useRealTimers());

describe('GoalsScreen', () => {
  it('shows the calculated goals and what they are worked out from', async () => {
    await render(<GoalsScreen />);
    expect(screen.getByRole('radio', { name: 'Calculated' })).toBeChecked();
    expect(screen.getByText(/^1,940/)).toBeTruthy();
    expect(screen.getByLabelText('Goal: Lose fat, A moderate deficit')).toBeTruthy();
    expect(screen.getByLabelText('Weight: 80 → 75 kg, 5 kg to go')).toBeTruthy();
    expect(screen.getByLabelText('Pace: 0.5 kg a week, By January 6')).toBeTruthy();
    expect(screen.getByLabelText(/^Activity: Lightly active/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save goals' })).toBeNull();
  });

  it('saves own goals, starting from the calculated ones', async () => {
    await render(<GoalsScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'My own' }));
    expect(screen.getByDisplayValue('1940')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Calories'), '2200');
    await fireEvent.changeText(screen.getByLabelText('Protein'), '160');
    expect(screen.getByText('Protein, carbs and fat make 2,042 of the 2,200 kcal.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Save goals' }));
    expect(setOwn).toHaveBeenCalledWith(
      { calories: 2200, proteinG: 160, carbsG: 229, fatG: 54 },
      expect.anything(),
    );
  });

  it('keeps Save off while the macros make more than the calories', async () => {
    await render(<GoalsScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'My own' }));
    await fireEvent.changeText(screen.getByLabelText('Calories'), '1200');
    expect(screen.getByText(/more than the 1,200 kcal of the goal/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save goals' })).toBeDisabled();
  });

  it('puts the calculated goals back in use at once', async () => {
    jest
      .mocked(useOwnTargets)
      .mockReturnValue(
        loaded({ targets: { calories: 2200, proteinG: 160, carbsG: 240, fatG: 65 }, inUse: true }),
      );
    await render(<GoalsScreen />);
    expect(screen.getByRole('radio', { name: 'My own' })).toBeChecked();
    expect(screen.getByDisplayValue('2200')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Calculated' }));
    expect(useCalculated).toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('says the target is reached, without a pace, once the weight is at or past it', async () => {
    jest
      .mocked(useLatestWeight)
      .mockReturnValue(loaded({ weightKg: 74.6, measuredOn: '2026-10-28' }));
    await render(<GoalsScreen />);
    expect(screen.getByLabelText('Weight: 74.6 kg, Target reached')).toBeTruthy();
    expect(screen.queryByLabelText(/^Pace/)).toBeNull();
    expect(screen.queryByText(/to go/)).toBeNull();
  });

  it('keeps Save off while the switch to Calculated is saving', async () => {
    jest
      .mocked(useOwnTargets)
      .mockReturnValue(
        loaded({ targets: { calories: 2200, proteinG: 160, carbsG: 240, fatG: 65 }, inUse: true }),
      );
    jest
      .mocked(useUseCalculatedTargets)
      .mockReturnValue({ mutate: useCalculated, isPending: true } as never);
    await render(<GoalsScreen />);
    expect(screen.getByRole('button', { name: 'Save goals' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('radio', { name: 'Calculated' }));
    expect(useCalculated).not.toHaveBeenCalled();
  });

  it('goes back to My own when the switch to Calculated fails', async () => {
    jest
      .mocked(useOwnTargets)
      .mockReturnValue(
        loaded({ targets: { calories: 2200, proteinG: 160, carbsG: 240, fatG: 65 }, inUse: true }),
      );
    useCalculated.mockImplementation((_: unknown, { onError }: { onError: () => void }) =>
      onError(),
    );
    await render(<GoalsScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Calculated' }));
    expect(screen.getByRole('radio', { name: 'My own' })).toBeChecked();
  });
});
