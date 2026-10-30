import { Alert, type AlertButton } from 'react-native';

import { act, fireEvent, render, screen, waitFor } from '@/test/render';

import {
  useAddAlternative,
  useDeleteAlternative,
  useRenameAlternative,
  useReorderAlternatives,
  useWorkoutAlternatives,
  type WorkoutAlternative,
} from './alternatives';
import { AlternativesSheets } from './alternatives-sheet';
import { testExercise, testWorkout } from './test-data';
import { useWorkoutLimits } from './workouts';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
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

const workout = testWorkout(7, { exercises: [testExercise('squat'), testExercise('row')] });

const GYM_HOME_HOTEL: WorkoutAlternative[] = [
  { id: 3, position: 1, name: 'Gym', inUse: false, exerciseCount: 4 },
  { id: 5, position: 2, name: null, inUse: true, exerciseCount: null },
  { id: 6, position: 3, name: 'Hotel', inUse: false, exerciseCount: 1 },
];

function mockAlternatives(data: WorkoutAlternative[]) {
  jest.mocked(useWorkoutAlternatives).mockReturnValue({ data } as never);
}

function mockRename(state: object = {}) {
  jest
    .mocked(useRenameAlternative)
    .mockReturnValue({ mutate: rename, isPending: false, isError: false, ...state } as never);
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
  mockRename();
});

it('lists the alternatives in order, the one in use with the workout’s exercises', async () => {
  await render(<AlternativesSheets workout={workout} onClose={onClose} />);
  expect(screen.getByText('Gym')).toBeTruthy();
  expect(screen.getByText('4 exercises')).toBeTruthy();
  expect(screen.getByText('Alternative 2')).toBeTruthy();
  expect(screen.getByText('In use · 2 exercises')).toBeTruthy();
  expect(screen.getByText('Hotel')).toBeTruthy();
  expect(screen.getByText('1 exercise')).toBeTruthy();
  // Each row's handle is named after it, in order.
  expect(screen.getByLabelText('Gym').props.accessibilityValue).toEqual({ text: '1 of 3' });
  expect(screen.getByLabelText('Hotel').props.accessibilityValue).toEqual({ text: '3 of 3' });
  // The one in use cannot be deleted.
  expect(
    screen.getByRole('button', { name: 'Delete Alternative 2' }).props.accessibilityState,
  ).toEqual({ disabled: true });
  expect(
    screen.getByText('A new one starts as a copy of the one in use, to change in Edit.'),
  ).toBeTruthy();
});

it('shows the workout as the only one before any is added', async () => {
  mockAlternatives([]);
  await render(<AlternativesSheets workout={workout} onClose={onClose} />);
  expect(screen.getByText('Alternative 1')).toBeTruthy();
  expect(screen.getByText('In use · 2 exercises')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Rename/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
});

it('adds a copy of the one in use, then asks for its name', async () => {
  await render(<AlternativesSheets workout={workout} onClose={onClose} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Add alternative' }));
  expect(add).toHaveBeenCalled();
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

  // Once saved, the list shows again.
  await act(async () => rename.mock.calls[0]?.[1]?.onSuccess());
  await waitFor(() => expect(screen.getByText('Add alternative')).toBeTruthy());
});

it('renames an alternative, or leaves it unnamed', async () => {
  await render(<AlternativesSheets workout={workout} onClose={onClose} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Rename Gym' }));
  await waitFor(() => expect(screen.getByLabelText('Name the alternative')).toBeTruthy());
  expect(screen.getByLabelText('Name the alternative').props.value).toBe('Gym');
  expect(screen.getByText('Left empty, it shows as “Alternative 1”.')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Name the alternative'), '');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(rename).toHaveBeenCalledWith({ id: 3, name: '' }, expect.anything());
});

it('closes the name without saving when it did not change', async () => {
  await render(<AlternativesSheets workout={workout} onClose={onClose} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Rename Hotel' }));
  await waitFor(() => expect(screen.getByLabelText('Name the alternative')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(rename).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByText('Add alternative')).toBeTruthy());
});

it('says why a name was not saved', async () => {
  mockRename({ isError: true, error: { code: 'P0002' } });
  await render(<AlternativesSheets workout={workout} onClose={onClose} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Rename Gym' }));
  await waitFor(() => expect(screen.getByText('This alternative no longer exists.')).toBeTruthy());
});

it('asks before deleting an alternative', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  await render(<AlternativesSheets workout={workout} onClose={onClose} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Delete Hotel' }));
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
  await render(<AlternativesSheets workout={workout} onClose={onClose} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Delete Gym' }));
  const buttons = alert.mock.calls[0]?.[2] as AlertButton[];
  await act(async () => buttons.find((button) => button.style === 'destructive')?.onPress?.());
  await act(async () => remove.mock.calls[0]?.[1]?.onError({ code: 'BB042' }));
  expect(
    screen.getByText("The one in use can't be deleted. Switch to another first."),
  ).toBeTruthy();
});

it('saves a new order', async () => {
  await render(<AlternativesSheets workout={workout} onClose={onClose} />);
  await fireEvent(screen.getByLabelText('Gym'), 'accessibilityAction', {
    nativeEvent: { actionName: 'moveDown' },
  });
  expect(reorder).toHaveBeenCalledWith([5, 3, 6], expect.anything());
  await act(async () => reorder.mock.calls[0]?.[1]?.onError(new Error('offline')));
  expect(screen.getByText("We couldn't save the order. Try again.")).toBeTruthy();
});

it('adds no more than the cap', async () => {
  mockAlternatives(
    [1, 2, 3, 4, 5].map((position) => ({
      id: position,
      position,
      name: null,
      inUse: position === 1,
      exerciseCount: position === 1 ? null : 1,
    })),
  );
  await render(<AlternativesSheets workout={workout} onClose={onClose} />);
  const button = screen.getByRole('button', { name: 'Add alternative' });
  expect(button.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  await fireEvent.press(button);
  expect(add).not.toHaveBeenCalled();
  expect(screen.getByText('Up to 5 alternatives. Delete one to add another.')).toBeTruthy();
});

it('says when the cap refused an add', async () => {
  await render(<AlternativesSheets workout={workout} onClose={onClose} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Add alternative' }));
  await act(async () => add.mock.calls[0]?.[1]?.onError({ code: 'BB041' }));
  expect(screen.getByText('A workout can have up to 5 alternatives.')).toBeTruthy();
});

it('closes on the scrim', async () => {
  await render(<AlternativesSheets workout={workout} onClose={onClose} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalled();
});
