import { router } from 'expo-router';
import { Alert, type AlertButton } from 'react-native';

import { fireEvent, render, screen } from '@/test/render';

import { useArchiveExercise, useKindLock } from './custom';
import { EditExerciseScreen } from './edit-exercise-screen';
import { ExerciseScreen } from './exercise-screen';
import { useExerciseDetails, type LibraryExercise } from './library';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('./custom', () => ({ useArchiveExercise: jest.fn(), useKindLock: jest.fn() }));
jest.mock('./library', () => ({ useExerciseDetails: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/workouts/workouts', () => ({
  exerciseImageUrl: (path: string) => `https://images.test/${path}`,
}));

const ROW: LibraryExercise = {
  id: 'row',
  name: 'Seated cable row',
  searchText: 'seated cable rows',
  metrics: ['weight', 'reps'],
  primaryMuscles: ['middle back'],
  secondaryMuscles: ['biceps', 'lats'],
  equipment: 'cable',
  level: 'beginner',
  category: 'strength',
  imagePaths: ['row/0.webp', 'row/1.webp'],
  custom: false,
  archived: false,
};

const query = <T,>(data: T | undefined, state: { isError?: boolean } = {}) => ({
  data,
  isPending: data === undefined && !state.isError,
  isError: state.isError ?? false,
  isFetching: false,
  refetch: jest.fn(),
});

function mockDetails(exercises: LibraryExercise[] | undefined, steps: string[] | undefined) {
  jest.mocked(useExerciseDetails).mockReturnValue({
    library: query(exercises),
    instructions: query(steps),
  } as never);
}

const archive = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useArchiveExercise).mockReturnValue({
    mutateAsync: archive.mockResolvedValue(undefined),
    isPending: false,
  } as never);
});

describe('ExerciseScreen', () => {
  it('shows the start and end pictures, the muscles, equipment and level', async () => {
    mockDetails([ROW], ['Sit down.', 'Pull.']);
    await render(<ExerciseScreen id="row" />);
    expect(screen.getByText('Seated cable row')).toBeTruthy();
    expect(screen.getByLabelText('Start').props.source).toEqual({
      uri: 'https://images.test/row/0.webp',
    });
    expect(screen.getByLabelText('End').props.source).toEqual({
      uri: 'https://images.test/row/1.webp',
    });
    expect(screen.getByText('Middle back')).toBeTruthy();
    expect(screen.getByText('Biceps')).toBeTruthy();
    expect(screen.getByText('Cable')).toBeTruthy();
    expect(screen.getByText('Beginner')).toBeTruthy();
  });

  it('lists the steps in order', async () => {
    mockDetails([ROW], ['Sit down.', 'Pull.']);
    await render(<ExerciseScreen id="row" />);
    expect(screen.getByText('How to do it')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('Sit down.')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Pull.')).toBeTruthy();
  });

  it('shows a single picture without captions', async () => {
    mockDetails([{ ...ROW, imagePaths: ['row/0.webp'] }], []);
    await render(<ExerciseScreen id="row" />);
    expect(screen.getByLabelText('Start')).toBeTruthy();
    expect(screen.queryByText('End')).toBeNull();
    expect(screen.queryByText('How to do it')).toBeNull();
  });

  it('says when the exercise does not exist, and goes back', async () => {
    mockDetails([ROW], []);
    await render(<ExerciseScreen id="nothing" />);
    expect(screen.getByText('Exercise not found')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.back).toHaveBeenCalled();
  });

  it('shows a spinner while loading', async () => {
    mockDetails(undefined, undefined);
    await render(<ExerciseScreen id="row" />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it("edits and archives the user's own exercise, and leaves out equipment it has not", async () => {
    mockDetails([{ ...ROW, custom: true, equipment: null, imagePaths: [] }], []);
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons?: AlertButton[]) => {
      buttons?.find((button) => button.text === 'Archive exercise')?.onPress?.();
    });
    await render(<ExerciseScreen id="row" />);
    expect(screen.queryByText('Equipment')).toBeNull();
    expect(screen.getByText('Mine')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workout/exercise/edit',
      params: { id: 'row' },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Archive exercise' }));
    expect(archive).toHaveBeenCalledWith(true);
    expect(router.back).toHaveBeenCalled();
  });

  it('brings an archived exercise back, and has no edit for library exercises', async () => {
    mockDetails([{ ...ROW, custom: true, archived: true }], []);
    await render(<ExerciseScreen id="row" />);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Bring back' }));
    expect(archive).toHaveBeenCalledWith(false);

    mockDetails([ROW], []);
    await render(<ExerciseScreen id="row" />);
    expect(screen.queryByRole('button', { name: 'Archive exercise' })).toBeNull();
  });
});

describe('EditExerciseScreen', () => {
  it("says when the exercise is gone or not the user's, rather than loading on", async () => {
    jest.mocked(useKindLock).mockReturnValue(query(null) as never);
    mockDetails([ROW], []);
    await render(<EditExerciseScreen id="gone" />);
    expect(screen.getByText('Exercise not found')).toBeTruthy();
    await render(<EditExerciseScreen id="row" />);
    expect(screen.getByText('Exercise not found')).toBeTruthy();
  });
});
