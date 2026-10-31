import { Alert, type AlertButton } from 'react-native';

import { act, fireEvent, render, screen, waitFor } from '@/test/render';

import {
  useAddAlternative,
  useChooseAlternative,
  useDeleteAlternative,
  useRenameAlternative,
  useReorderAlternatives,
  useWorkoutAlternatives,
  type WorkoutAlternative,
} from './alternatives';
import { AlternativesSheets } from './alternatives-sheet';
import { holdSwitches, testExercise, testWorkout, type HeldSwitch } from './test-data';
import { useWorkoutLimits } from './workouts';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('./alternatives', () => ({
  ...jest.requireActual<typeof import('./alternatives')>('./alternatives'),
  useWorkoutAlternatives: jest.fn(),
  useAddAlternative: jest.fn(),
  useDeleteAlternative: jest.fn(),
  useRenameAlternative: jest.fn(),
  useReorderAlternatives: jest.fn(),
}));
jest.mock('./workouts', () => ({
  ...jest.requireActual<typeof import('./workouts')>('./workouts'),
  useWorkoutLimits: jest.fn(),
}));

const add = jest.fn();
const remove = jest.fn();
const rename = jest.fn();
const reorder = jest.fn();
const onClose = jest.fn();
const onRunning = jest.fn();
let switches: HeldSwitch[] = [];

const workout = testWorkout(7, { exercises: [testExercise('squat'), testExercise('row')] });

const GYM_HOME_HOTEL: WorkoutAlternative[] = [
  { id: 3, position: 1, name: 'Gym', inUse: false, exerciseCount: 4 },
  { id: 5, position: 2, name: null, inUse: true, exerciseCount: null },
  { id: 6, position: 3, name: 'Hotel', inUse: false, exerciseCount: 0 },
];

function mockAlternatives(data: WorkoutAlternative[]) {
  jest.mocked(useWorkoutAlternatives).mockReturnValue({ data } as never);
}

function mockRename(state: object = {}) {
  jest
    .mocked(useRenameAlternative)
    .mockReturnValue({ mutate: rename, isPending: false, isError: false, ...state } as never);
}

/** The sheets with the choice of the one in use that the workout's screen gives them. */
function Sheets({ running }: { running: boolean }) {
  const choice = useChooseAlternative({
    alternatives: useWorkoutAlternatives(workout.id).data,
    running,
    onRunning,
  });
  return (
    <AlternativesSheets workout={workout} running={running} choice={choice} onClose={onClose} />
  );
}

function renderSheets(running = false) {
  return render(<Sheets running={running} />);
}

/** Opens the ⋯ menu of an alternative. */
async function openMenu(name: string) {
  await fireEvent.press(screen.getByRole('button', { name: `More for ${name}` }));
}

/** The alternatives switched to so far. */
const switched = () => switches.map((held) => held.alternativeId);

const menuItem = (name: string) => screen.queryByRole('menuitem', { name });

/** Answers the name sheet with `name`, once the list has closed before it. */
async function nameIt(name: string) {
  await waitFor(() => expect(screen.getByLabelText('Name the alternative')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('Name the alternative'), name);
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useWorkoutLimits).mockReturnValue({
    data: { exercises: 20, workouts: 3, alternatives: 5, alternative_name_length: 12 },
  } as never);
  mockAlternatives(GYM_HOME_HOTEL);
  jest.mocked(useAddAlternative).mockReturnValue({ mutate: add, isPending: false } as never);
  jest.mocked(useDeleteAlternative).mockReturnValue({ mutate: remove } as never);
  jest.mocked(useReorderAlternatives).mockReturnValue({ mutate: reorder } as never);
  switches = holdSwitches();
  mockRename();
});

it('lists the alternatives in order, the one in use chosen, with their exercises', async () => {
  await renderSheets();
  expect(screen.getByText('Tap one to use it. Drag to change the order.')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Gym' }).props.accessibilityState).toEqual({
    checked: false,
  });
  expect(screen.getByText('4 exercises')).toBeTruthy();
  // The one in use has the workout's exercises.
  expect(screen.getByRole('radio', { name: 'Alternative 2' }).props.accessibilityState).toEqual({
    checked: true,
  });
  expect(screen.getByText('2 exercises')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Hotel' })).toBeTruthy();
  expect(screen.getByText('No exercises yet')).toBeTruthy();
  // Each row's handle is named after it, in order.
  const handles = screen.getAllByLabelText('Hotel');
  expect(handles.some((handle) => handle.props.accessibilityValue?.text === '3 of 3')).toBe(true);
  // The example is for a workout without alternatives only.
  expect(
    screen.queryByText('Barbell squat, leg press…', { includeHiddenElements: true }),
  ).toBeNull();
  expect(screen.getByRole('button', { name: 'Add alternative' })).toBeTruthy();
  expect(screen.getByText('Starts empty')).toBeTruthy();
});

it('shows the workout as the only one, and an example, before any is added', async () => {
  mockAlternatives([]);
  await renderSheets();
  expect(screen.getByText('Versions of this workout to switch between.')).toBeTruthy();
  // Hidden from screen readers, which the line above tells.
  const hidden = { includeHiddenElements: true };
  expect(screen.getByText('Barbell squat, leg press…', hidden)).toBeTruthy();
  expect(screen.getByText('Goblet squat, lunges…', hidden)).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Alternative 1' }).props.accessibilityState).toEqual({
    checked: true,
  });

  // It can only be duplicated, as a copy of the one in use.
  await openMenu('Alternative 1');
  expect(menuItem('Rename')).toBeNull();
  expect(menuItem('Delete')).toBeNull();
  await fireEvent.press(menuItem('Duplicate')!);
  expect(add).toHaveBeenCalledWith({ copyOf: null }, expect.anything());
});

it('shows neither the workout alone nor Add while the alternatives load', async () => {
  jest.mocked(useWorkoutAlternatives).mockReturnValue({ data: undefined, isError: false } as never);
  await renderSheets();
  expect(screen.getByLabelText('Loading')).toBeTruthy();
  expect(screen.queryByRole('radio')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add alternative' })).toBeNull();
});

it('says the alternatives did not load, and loads them again', async () => {
  const refetch = jest.fn();
  jest
    .mocked(useWorkoutAlternatives)
    .mockReturnValue({ data: undefined, isError: true, refetch } as never);
  await renderSheets();
  expect(screen.getByText("We couldn't load the alternatives.")).toBeTruthy();
  expect(screen.queryByRole('radio')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(refetch).toHaveBeenCalled();
});

it('adds an empty alternative, asks for its name, then puts it in use and closes', async () => {
  await renderSheets();
  await fireEvent.press(screen.getByRole('button', { name: 'Add alternative' }));
  expect(add).toHaveBeenCalledWith({ empty: true }, expect.anything());
  await act(async () => add.mock.calls[0]?.[1]?.onSuccess(9));

  // The list closes before the name opens, as iOS shows one sheet at a time.
  await waitFor(() => expect(screen.getByText('Name the alternative')).toBeTruthy());
  const field = screen.getByLabelText('Name the alternative');
  expect(field.props.placeholder).toBe('Alternative 4');
  expect(screen.getByText('Left empty, it shows as “Alternative 4”.')).toBeTruthy();
  expect(screen.getByText('0/12')).toBeTruthy();
  expect(field.props.maxLength).toBe(12);

  await fireEvent.changeText(field, 'Home');
  expect(screen.getByText('4/12')).toBeTruthy();
  expect(screen.getByLabelText('4 of 12 characters')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(rename).toHaveBeenCalledWith({ id: 9, name: 'Home' }, expect.anything());

  await act(async () => rename.mock.calls[0]?.[1]?.onSuccess());
  expect(switched()).toEqual([9]);
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => switches[0]?.succeed());
  expect(onClose).toHaveBeenCalled();
});

it('puts a new alternative in use when its name is left as it is', async () => {
  await renderSheets();
  await fireEvent.press(screen.getByRole('button', { name: 'Add alternative' }));
  await act(async () => add.mock.calls[0]?.[1]?.onSuccess(9));
  await waitFor(() => expect(screen.getByText('Name the alternative')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(rename).not.toHaveBeenCalled();
  expect(switched()).toEqual([9]);
});

it('says why a new alternative was not put in use, back on the list', async () => {
  await renderSheets();
  await fireEvent.press(screen.getByRole('button', { name: 'Add alternative' }));
  await act(async () => add.mock.calls[0]?.[1]?.onSuccess(9));
  await nameIt('');
  await act(async () => switches[0]?.fail(new Error('offline')));
  await waitFor(() =>
    expect(screen.getByText("We couldn't switch to it. Try again.")).toBeTruthy(),
  );
  expect(onClose).not.toHaveBeenCalled();
});

it('keeps a new alternative out of use while the workout runs', async () => {
  await renderSheets(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Add alternative' }));
  await act(async () => add.mock.calls[0]?.[1]?.onSuccess(9));
  await nameIt('Home');
  await act(async () => rename.mock.calls[0]?.[1]?.onSuccess());
  expect(switched()).toEqual([]);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add alternative' })).toBeTruthy());
});

it('puts the alternative tapped in use, and not the one in use again', async () => {
  await renderSheets();
  await fireEvent.press(screen.getByRole('radio', { name: 'Alternative 2' }));
  expect(switched()).toEqual([]);
  await fireEvent.press(screen.getByRole('radio', { name: 'Hotel' }));
  expect(switched()).toEqual([6]);
  expect(onClose).not.toHaveBeenCalled();

  await act(async () => switches[0]?.fail({ code: 'P0002' }));
  expect(screen.getByText('This alternative no longer exists.')).toBeTruthy();
});

it('marks the one being put in use as chosen while that runs, and waits for it', async () => {
  await renderSheets();
  await fireEvent.press(screen.getByRole('radio', { name: 'Gym' }));
  await waitFor(() =>
    expect(screen.getByRole('radio', { name: 'Gym' }).props.accessibilityState).toEqual({
      checked: true,
    }),
  );
  expect(screen.getByRole('radio', { name: 'Alternative 2' }).props.accessibilityState).toEqual({
    checked: false,
  });
  // No other until it is done.
  await fireEvent.press(screen.getByRole('radio', { name: 'Hotel' }));
  expect(switched()).toEqual([3]);
});

it('asks to finish the running workout before putting another in use', async () => {
  await renderSheets(true);
  await fireEvent.press(screen.getByRole('radio', { name: 'Gym' }));
  expect(switched()).toEqual([]);
  expect(onRunning).toHaveBeenCalled();
});

it('offers rename, duplicate and delete in an alternative’s menu, but no delete for the one in use', async () => {
  await renderSheets();
  await openMenu('Hotel');
  expect(menuItem('Rename')).toBeTruthy();
  expect(menuItem('Duplicate')).toBeTruthy();
  expect(menuItem('Delete')).toBeTruthy();
  // A tap outside closes it.
  await fireEvent.press(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);
  expect(menuItem('Rename')).toBeNull();

  await openMenu('Alternative 2');
  expect(menuItem('Rename')).toBeTruthy();
  expect(menuItem('Duplicate')).toBeTruthy();
  expect(menuItem('Delete')).toBeNull();
});

it('duplicates an alternative, asks for its name and goes back to the list', async () => {
  await renderSheets();
  await openMenu('Gym');
  await fireEvent.press(menuItem('Duplicate')!);
  expect(add).toHaveBeenCalledWith({ copyOf: 3 }, expect.anything());
  await act(async () => add.mock.calls[0]?.[1]?.onSuccess(9));
  await nameIt('Gym short');
  expect(rename).toHaveBeenCalledWith({ id: 9, name: 'Gym short' }, expect.anything());
  await act(async () => rename.mock.calls[0]?.[1]?.onSuccess());
  // A copy is not put in use.
  expect(switched()).toEqual([]);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add alternative' })).toBeTruthy());
});

it('says when a duplicate failed', async () => {
  await renderSheets();
  await openMenu('Alternative 2');
  await fireEvent.press(menuItem('Duplicate')!);
  expect(add).toHaveBeenCalledWith({ copyOf: 5 }, expect.anything());
  await act(async () => add.mock.calls[0]?.[1]?.onError(new Error('offline')));
  expect(screen.getByText("We couldn't duplicate it. Try again.")).toBeTruthy();
});

it('renames an alternative, or leaves it unnamed', async () => {
  await renderSheets();
  await openMenu('Gym');
  await fireEvent.press(menuItem('Rename')!);
  await waitFor(() => expect(screen.getByLabelText('Name the alternative')).toBeTruthy());
  expect(screen.getByLabelText('Name the alternative').props.value).toBe('Gym');
  expect(screen.getByText('Left empty, it shows as “Alternative 1”.')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Name the alternative'), '');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(rename).toHaveBeenCalledWith({ id: 3, name: '' }, expect.anything());
  await act(async () => rename.mock.calls[0]?.[1]?.onSuccess());
  expect(switched()).toEqual([]);
});

it('closes the name without saving when it did not change', async () => {
  await renderSheets();
  await openMenu('Hotel');
  await fireEvent.press(menuItem('Rename')!);
  await waitFor(() => expect(screen.getByLabelText('Name the alternative')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(rename).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add alternative' })).toBeTruthy());
});

it('says why a name was not saved', async () => {
  mockRename({ isError: true, error: { code: 'P0002' } });
  await renderSheets();
  await openMenu('Gym');
  await fireEvent.press(menuItem('Rename')!);
  await waitFor(() => expect(screen.getByText('This alternative no longer exists.')).toBeTruthy());
});

it('asks before deleting an alternative', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  await renderSheets();
  await openMenu('Hotel');
  await fireEvent.press(menuItem('Delete')!);
  expect(alert.mock.calls[0]?.slice(0, 2)).toEqual([
    'Delete Hotel?',
    'It is removed with its exercises. This cannot be undone.',
  ]);
  expect(remove).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0]?.[2] as AlertButton[];
  await act(async () => buttons.find((button) => button.style === 'destructive')?.onPress?.());
  expect(remove).toHaveBeenCalledWith(6, expect.anything());
});

it('says why a delete failed', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  await renderSheets();
  await openMenu('Gym');
  await fireEvent.press(menuItem('Delete')!);
  const buttons = alert.mock.calls[0]?.[2] as AlertButton[];
  await act(async () => buttons.find((button) => button.style === 'destructive')?.onPress?.());
  await act(async () => remove.mock.calls[0]?.[1]?.onError({ code: 'BB042' }));
  expect(
    screen.getByText("The one in use can't be deleted. Switch to another first."),
  ).toBeTruthy();
});

it('saves a new order', async () => {
  await renderSheets();
  const [handle] = screen
    .getAllByLabelText('Gym')
    .filter((element) => element.props.accessibilityValue !== undefined);
  await fireEvent(handle!, 'accessibilityAction', {
    nativeEvent: { actionName: 'moveDown' },
  });
  expect(reorder).toHaveBeenCalledWith([5, 3, 6], expect.anything());
  await act(async () => reorder.mock.calls[0]?.[1]?.onError(new Error('offline')));
  expect(screen.getByText("We couldn't save the order. Try again.")).toBeTruthy();
});

it('adds and duplicates no more than the cap', async () => {
  mockAlternatives(
    [1, 2, 3, 4, 5].map((position) => ({
      id: position,
      position,
      name: null,
      inUse: position === 1,
      exerciseCount: position === 1 ? null : 1,
    })),
  );
  await renderSheets();
  expect(screen.queryByRole('button', { name: 'Add alternative' })).toBeNull();
  expect(screen.getByText('5 of 5. Delete one to add or duplicate another.')).toBeTruthy();
  await openMenu('Alternative 2');
  expect(menuItem('Duplicate')!.props.accessibilityState).toEqual({ disabled: true });
  await fireEvent.press(menuItem('Duplicate')!);
  expect(add).not.toHaveBeenCalled();
});

it('says when the cap refused an add', async () => {
  await renderSheets();
  await fireEvent.press(screen.getByRole('button', { name: 'Add alternative' }));
  await act(async () => add.mock.calls[0]?.[1]?.onError({ code: 'BB041' }));
  expect(screen.getByText('A workout can have up to 5 alternatives.')).toBeTruthy();
});

it('closes on the scrim', async () => {
  await renderSheets();
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalled();
});
