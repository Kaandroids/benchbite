import { router } from 'expo-router';

import { fireEvent, render, screen } from '@/test/render';

import { CreateExerciseScreen } from './create-exercise-screen';
import { emptyForm, takeCreatedExercise, useCreateExercise, useEditExercise } from './custom';

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  usePreventRemove: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('./custom', () => ({
  ...jest.requireActual<typeof import('./custom')>('./custom'),
  useCreateExercise: jest.fn(),
  useEditExercise: jest.fn(),
}));

const mutateAsync = jest.fn();
const editAsync = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useCreateExercise).mockReturnValue({ mutateAsync, isPending: false } as never);
  jest.mocked(useEditExercise).mockReturnValue({
    mutateAsync: editAsync.mockResolvedValue(undefined),
    isPending: false,
  } as never);
});

describe('CreateExerciseScreen', () => {
  it('creates an exercise once it has a name, a way of logging and a main muscle', async () => {
    mutateAsync.mockResolvedValue({ id: 'custom-1', name: 'Hip thrust' });
    await render(<CreateExerciseScreen name="Hip thrust" />);
    expect(screen.getByLabelText('Name').props.value).toBe('Hip thrust');
    const create = screen.getByRole('button', { name: 'Create exercise' });
    expect(create).toBeDisabled();

    await fireEvent.press(screen.getByRole('button', { name: 'What you log: Choose' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Weight × reps' }));
    // Choosing it closes the sheet and shows it on the form.
    expect(screen.queryByRole('radio', { name: 'Reps' })).toBeNull();
    expect(screen.getByRole('button', { name: 'What you log: Weight × reps' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Main muscles: Choose' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Glutes' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Main muscles: Glutes' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Other muscles: Choose' }));
    // A main muscle is no longer offered as another one.
    expect(screen.queryByRole('button', { name: 'Glutes' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Hamstrings' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Equipment: Choose' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Machine' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add a step' }));
    await fireEvent.changeText(screen.getByLabelText('Step 1'), 'Drive up.');
    expect(screen.getByRole('button', { name: 'Create exercise' })).toBeEnabled();

    await fireEvent.press(screen.getByRole('button', { name: 'Create exercise' }));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Hip thrust',
        logKind: 'weightReps',
        primaryMuscles: ['glutes'],
        secondaryMuscles: ['hamstrings'],
        equipment: 'machine',
        level: 'beginner',
        instructions: ['Drive up.'],
      }),
    );
    expect(takeCreatedExercise()).toEqual({ id: 'custom-1', name: 'Hip thrust' });
    expect(router.back).toHaveBeenCalled();
  });

  it('edits an exercise, keeping what it records once it is logged', async () => {
    const form = {
      ...emptyForm('Hip thrust'),
      logKind: 'weightReps' as const,
      primaryMuscles: ['glutes' as const],
    };
    await render(<CreateExerciseScreen editing={{ id: 'custom-1', form, kindLock: 'logged' }} />);
    expect(screen.getByText('Edit exercise')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'What you log: Weight × reps' }));
    expect(screen.getByRole('radio', { name: 'Reps' })).toBeDisabled();
    expect(screen.getByText('It has been logged, so this stays.')).toBeTruthy();
    // The sheet's scrim, after the screen's own cross.
    await fireEvent.press(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);
    // Nothing changed yet, so nothing to save.
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Name'), 'Hip thrust machine');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(editAsync).toHaveBeenCalledWith({
      form: expect.objectContaining({ name: 'Hip thrust machine' }),
      before: [],
    });
    expect(router.back).toHaveBeenCalled();
  });

  it('says why what it records stays while a workout has it', async () => {
    const form = { ...emptyForm('Hip thrust'), logKind: 'reps' as const };
    await render(
      <CreateExerciseScreen editing={{ id: 'custom-1', form, kindLock: 'inWorkout' }} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'What you log: Reps' }));
    expect(screen.getByRole('radio', { name: 'Reps' })).toBeDisabled();
    expect(
      screen.getByText(
        'It is in a workout, so this stays. Remove it from your workouts to change it.',
      ),
    ).toBeTruthy();
  });
});
