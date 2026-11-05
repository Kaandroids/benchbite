import { router } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { fireEvent, render, screen, waitFor } from '@/test/render';

import { useChoiceAlternatives, type ChoiceAlternative, useLastTrained } from './choice';
import { ChooseWhatStaysScreen } from './choose-what-stays-screen';
import { testWorkout } from './test-data';
import { useWorkoutLimits, useWorkouts } from './workouts';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('./workouts', () => ({
  ...jest.requireActual<typeof import('./workouts')>('./workouts'),
  useWorkouts: jest.fn(),
  useWorkoutLimits: jest.fn(),
}));
jest.mock('./choice', () => ({
  ...jest.requireActual<typeof import('./choice')>('./choice'),
  useChoiceAlternatives: jest.fn(),
  useLastTrained: jest.fn(),
}));

const loaded = (data: unknown) => ({ data, isPending: false, isError: false, isFetching: false });

const WORKOUTS = [
  testWorkout(1, { name: 'Push' }),
  testWorkout(2, { name: 'Pull' }),
  testWorkout(3, { name: 'Legs' }),
  testWorkout(4, { name: 'Core', held: true }),
  testWorkout(5, { name: 'Old', active: false, held: true }),
];

const alternative = (id: number, workoutId: number, name: string, held = false) =>
  ({ id, workoutId, position: 2, name, held, lastUsedAt: null }) satisfies ChoiceAlternative;

function mockChoice(alternatives: ChoiceAlternative[] = []) {
  jest.mocked(useWorkouts).mockReturnValue(loaded(WORKOUTS) as never);
  jest
    .mocked(useWorkoutLimits)
    .mockReturnValue(loaded({ workouts: 3, alternatives: 2, added_alternatives: 1 }) as never);
  jest.mocked(useChoiceAlternatives).mockReturnValue(loaded(alternatives) as never);
  jest.mocked(useLastTrained).mockReturnValue(loaded(new Map()) as never);
  jest.mocked(supabase.rpc).mockResolvedValue({ error: null } as never);
}

const checkbox = (name: RegExp) => screen.getByRole('checkbox', { name });
const keep = () => screen.getByRole('button', { name: 'Keep these 3' });

beforeEach(() => jest.clearAllMocks());

it('starts from the workouts that stay now, without the archive', async () => {
  mockChoice();
  await render(<ChooseWhatStaysScreen />);

  expect(checkbox(/^Push/)).toBeChecked();
  expect(checkbox(/^Core/)).not.toBeChecked();
  expect(screen.queryByRole('checkbox', { name: /^Old/ })).toBeNull();
  expect(screen.getByText('3 of 3 chosen')).toBeOnTheScreen();
});

it('takes no more than fit, and asks for as many as fit', async () => {
  mockChoice();
  await render(<ChooseWhatStaysScreen />);

  await fireEvent.press(checkbox(/^Core/));
  expect(checkbox(/^Core/)).not.toBeChecked();

  await fireEvent.press(checkbox(/^Push/));
  expect(screen.getByText('2 of 3 chosen')).toBeOnTheScreen();
  expect(keep()).toBeDisabled();

  await fireEvent.press(checkbox(/^Core/));
  expect(keep()).toBeEnabled();
});

it('makes the choice with what is chosen, and goes back', async () => {
  mockChoice();
  await render(<ChooseWhatStaysScreen />);

  await fireEvent.press(checkbox(/^Push/));
  await fireEvent.press(checkbox(/^Core/));
  await fireEvent.press(keep());

  expect(supabase.rpc).toHaveBeenCalledWith(
    'choose_what_stays',
    expect.objectContaining({ workouts: [2, 3, 4], alternatives: [] }),
  );
  await waitFor(() => expect(router.back).toHaveBeenCalled());
});

it('asks which alternative stays when there are more than can', async () => {
  mockChoice([alternative(11, 1, 'Home'), alternative(21, 2, 'Short', true)]);
  await render(<ChooseWhatStaysScreen />);

  await fireEvent.press(keep());
  expect(supabase.rpc).not.toHaveBeenCalled();
  expect(screen.getByText('One alternative stays')).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: /^Home/ })).toBeChecked();

  await fireEvent.press(screen.getByRole('radio', { name: /^Short/ }));
  await fireEvent.press(screen.getByRole('button', { name: 'Keep this one' }));

  expect(supabase.rpc).toHaveBeenCalledWith(
    'choose_what_stays',
    expect.objectContaining({ workouts: [1, 2, 3], alternatives: [21] }),
  );
});

it('keeps the alternative of what stays without asking when it is the only one', async () => {
  mockChoice([alternative(11, 1, 'Home')]);
  await render(<ChooseWhatStaysScreen />);

  await fireEvent.press(keep());

  expect(supabase.rpc).toHaveBeenCalledWith(
    'choose_what_stays',
    expect.objectContaining({ alternatives: [11] }),
  );
});

it('says when the choice could not be saved, and stays', async () => {
  mockChoice();
  jest.mocked(supabase.rpc).mockResolvedValue({ error: { code: 'BB056' } } as never);
  await render(<ChooseWhatStaysScreen />);

  await fireEvent.press(keep());

  expect(await screen.findByText("We couldn't save your choice. Try again.")).toBeOnTheScreen();
  expect(router.back).not.toHaveBeenCalled();
});

it('goes back when the choice was made elsewhere', async () => {
  mockChoice();
  jest.mocked(supabase.rpc).mockResolvedValue({ error: { code: 'BB055' } } as never);
  await render(<ChooseWhatStaysScreen />);

  await fireEvent.press(keep());

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  expect(screen.queryByText("We couldn't save your choice. Try again.")).toBeNull();
});

it('leaves for the Today tab, or for premium', async () => {
  mockChoice();
  await render(<ChooseWhatStaysScreen />);

  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(router.navigate).toHaveBeenCalledWith('/');

  await fireEvent.press(screen.getByRole('button', { name: 'Get premium back' }));
  expect(router.push).toHaveBeenCalledWith('/premium');
});
