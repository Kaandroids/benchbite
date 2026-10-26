import type { Plan } from '@shared/plan/types';

import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { SetupStep } from './setup';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

const mockGeneratePlan = jest.fn();
jest.mock('@/onboarding/plan', () => ({
  generatePlan: (answers: unknown) => mockGeneratePlan(answers),
}));

jest.mock('@/exercises/library', () => ({
  useExerciseLibrary: () => ({
    data: [
      { id: 'goblet', name: 'Goblet Squat' },
      { id: 'floor-press', name: 'Dumbbell Floor Press' },
      { id: 'row', name: 'One-Arm Dumbbell Row' },
      { id: 'squat', name: 'Barbell Squat' },
    ],
  }),
  findExercise: (library: { id: string }[] | undefined, id: string) =>
    library?.find((exercise) => exercise.id === id),
}));

const exercise = (exerciseId: string, slot: 'squat' | 'conditioning' = 'squat') => ({
  exerciseId,
  slot,
  sets: 3,
  target: { reps: { min: 8, max: 12 } },
  restSeconds: 90,
});
const planOf = (...ids: string[]): Plan => ({
  sessions: [
    {
      weekdays: [1],
      type: 'full_body',
      exercises: [...ids.map((id) => exercise(id)), exercise('bike', 'conditioning')],
      estimatedMinutes: 45,
      time: { warmUp: 300, main: 1800, extras: 300, conditioning: 300 },
      work: { exercises: ids.length, sets: ids.length * 3, rest: 0 },
    },
  ],
});

const BODYWEIGHT = 'Bodyweight only, No equipment, a chair and a sturdy table';
const ANSWERS = { goal: 'lose_fat', experience: 'beginner', trainingDays: [1, 3, 5] } as const;

describe('SetupStep', () => {
  beforeEach(() => {
    mockGeneratePlan.mockReset();
    mockGeneratePlan.mockImplementation(async ({ setup }: { setup: string }) =>
      setup === 'dumbbells' ? planOf('goblet', 'floor-press', 'row', 'extra') : planOf('squat'),
    );
  });

  it('saves the tapped answer without moving on', async () => {
    mockStep = createStep({ ...ANSWERS, trainingDays: [1, 3, 5] });
    await render(<SetupStep />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('radio', { name: BODYWEIGHT }));
    expect(mockStep.answer).toHaveBeenCalledWith({ setup: 'bodyweight' });
    expect(mockStep.next).not.toHaveBeenCalled();
  });

  it('shows the first exercises the plan gives for the chosen setup', async () => {
    mockStep = createStep({ ...ANSWERS, trainingDays: [1, 3, 5], setup: 'dumbbells' });
    await render(<SetupStep />);
    expect(await screen.findByText('Goblet Squat')).toBeTruthy();
    expect(screen.getByText('Dumbbell Floor Press')).toBeTruthy();
    expect(screen.getByText('One-Arm Dumbbell Row')).toBeTruthy();
    // Every setup is asked about at once, so switching shows them straight away.
    expect(mockGeneratePlan).toHaveBeenCalledTimes(3);
  });

  it('moves on with Continue', async () => {
    mockStep = createStep({ ...ANSWERS, trainingDays: [1, 3, 5], setup: 'gym' });
    await render(<SetupStep />);
    expect(
      screen.getByRole('radio', { name: 'Gym, Machines, barbells and dumbbells' }),
    ).toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockStep.next).toHaveBeenCalledTimes(1);
  });
});
