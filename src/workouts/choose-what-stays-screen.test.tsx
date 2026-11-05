import { router } from 'expo-router';
import { BackHandler } from 'react-native';

import { supabase } from '@/lib/supabase';
import { act, fireEvent, render, screen, waitFor } from '@/test/render';

import { type ChoiceAlternative, useChoiceData } from './choice';
import { ChooseWhatStaysScreen } from './choose-what-stays-screen';
import { testWorkout } from './test-data';

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('./choice', () => ({
  ...jest.requireActual<typeof import('./choice')>('./choice'),
  useChoiceData: jest.fn(),
}));

const loaded = (data: unknown, isFetchedAfterMount = true) => ({
  data,
  isFetchedAfterMount,
  isPending: false,
  isError: false,
  isFetching: !isFetchedAfterMount,
});

const WORKOUTS = [
  testWorkout(1, { name: 'Push' }),
  testWorkout(2, { name: 'Pull' }),
  testWorkout(3, { name: 'Legs' }),
  testWorkout(4, { name: 'Core', held: true }),
  testWorkout(5, { name: 'Old', active: false, held: true }),
];

const alternative = (id: number, workoutId: number, name: string, held = false) =>
  ({ id, workoutId, position: 2, name, held, lastUsedAt: null }) satisfies ChoiceAlternative;

function mockChoice({
  workouts = WORKOUTS,
  alternatives = [] as ChoiceAlternative[],
  open = true,
  fresh = true,
} = {}) {
  jest.mocked(useChoiceData).mockReturnValue({
    limits: loaded({ workouts: 3, choice_open: open }),
    workouts: loaded(workouts, fresh),
    alternatives: loaded(alternatives),
    lastTrained: loaded(new Map([[1, '2026-10-03']])),
  } as never);
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

it('makes the choice with what is chosen', async () => {
  mockChoice();
  await render(<ChooseWhatStaysScreen />);

  await fireEvent.press(checkbox(/^Push/));
  await fireEvent.press(checkbox(/^Core/));
  await fireEvent.press(keep());

  expect(supabase.rpc).toHaveBeenCalledWith(
    'choose_what_stays',
    expect.objectContaining({ workouts: [2, 3, 4], alternatives: [] }),
  );
});

it('says when each workout was last trained', async () => {
  mockChoice();
  await render(<ChooseWhatStaysScreen />);

  expect(checkbox(/^Push/)).toBeOnTheScreen();
  expect(screen.getByText(/trained October 3/)).toBeOnTheScreen();
});

it('waits for the workouts as they are now, as what was kept may pick the wrong ones', async () => {
  mockChoice({ fresh: false });
  await render(<ChooseWhatStaysScreen />);

  expect(screen.queryByRole('checkbox', { name: /^Push/ })).toBeNull();
});

it('goes back once there is no choice to make', async () => {
  mockChoice({ open: false });
  await render(<ChooseWhatStaysScreen />);

  expect(router.back).toHaveBeenCalled();
});

it('asks which alternative stays when more could, and goes back a step', async () => {
  mockChoice({ alternatives: [alternative(11, 1, 'Home'), alternative(21, 2, 'Short', true)] });
  await render(<ChooseWhatStaysScreen />);

  await fireEvent.press(keep());
  expect(supabase.rpc).not.toHaveBeenCalled();
  expect(screen.getByText('One alternative stays')).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: /^Home/ })).toBeChecked();

  await fireEvent.press(screen.getByRole('radio', { name: /^Short/ }));
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(keep()).toBeOnTheScreen();
  await fireEvent.press(keep());
  expect(screen.getByRole('radio', { name: /^Short/ })).toBeChecked();

  await fireEvent.press(screen.getByRole('button', { name: 'Keep this one' }));
  expect(supabase.rpc).toHaveBeenCalledWith(
    'choose_what_stays',
    expect.objectContaining({ workouts: [1, 2, 3], alternatives: [21] }),
  );
});

it('keeps the only alternative of what stays without asking', async () => {
  mockChoice({ alternatives: [alternative(11, 1, 'Home')] });
  await render(<ChooseWhatStaysScreen />);

  await fireEvent.press(keep());

  expect(supabase.rpc).toHaveBeenCalledWith(
    'choose_what_stays',
    expect.objectContaining({ alternatives: [11] }),
  );
});

it('asks only for the alternative when the workouts fit, and the cross leaves', async () => {
  mockChoice({
    workouts: WORKOUTS.slice(0, 2),
    alternatives: [alternative(11, 1, 'Home'), alternative(21, 2, 'Short', true)],
  });
  await render(<ChooseWhatStaysScreen />);

  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.getByText('One alternative stays')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Keep this one' }));
  expect(supabase.rpc).toHaveBeenCalledWith(
    'choose_what_stays',
    expect.objectContaining({ workouts: [1, 2], alternatives: [11] }),
  );

  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(router.navigate).toHaveBeenCalledWith('/');
});

it('says when the choice could not be saved, and stays', async () => {
  mockChoice();
  jest.mocked(supabase.rpc).mockResolvedValue({ error: { code: 'BB056' } } as never);
  await render(<ChooseWhatStaysScreen />);

  await fireEvent.press(keep());

  expect(await screen.findByText("We couldn't save your choice. Try again.")).toBeOnTheScreen();
});

it('says nothing when the choice was made elsewhere', async () => {
  mockChoice();
  jest.mocked(supabase.rpc).mockResolvedValue({ error: { code: 'BB055' } } as never);
  await render(<ChooseWhatStaysScreen />);

  await fireEvent.press(keep());

  await waitFor(() => expect(supabase.rpc).toHaveBeenCalled());
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

it('stays while the choice is being saved', async () => {
  mockChoice();
  jest.mocked(supabase.rpc).mockReturnValue(new Promise(() => {}) as never);
  await render(<ChooseWhatStaysScreen />);

  await fireEvent.press(keep());
  await waitFor(() => expect(screen.getByRole('button', { busy: true })).toBeOnTheScreen());
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Get premium back' }));

  expect(router.navigate).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
});

it('takes the system back as its own, not to the list', async () => {
  const add = jest.spyOn(BackHandler, 'addEventListener');
  mockChoice();
  await render(<ChooseWhatStaysScreen />);

  let handled: boolean | null | undefined;
  await act(async () => {
    handled = (add.mock.lastCall?.[1] as () => boolean)();
  });

  expect(handled).toBe(true);
  expect(router.navigate).toHaveBeenCalledWith('/');
});
