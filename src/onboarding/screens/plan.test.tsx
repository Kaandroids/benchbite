import { saveOnboarding, type NutritionTargets, type WorkoutPlan } from '@/onboarding/plan';
import type { OnboardingAnswers } from '@/onboarding/types';
import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen, waitFor } from '@/test/render';

import { PlanStep } from './plan';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));
jest.mock('@/onboarding/plan', () => ({ saveOnboarding: jest.fn() }));

const mockExercises = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ in: (_column: string, ids: string[]) => mockExercises(ids) }),
    }),
  },
}));

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: ({ href }: { href: { params: { step: string } } }) => (
      <Text>Redirected to {href.params.step}</Text>
    ),
  };
});

const exercise = (exerciseId: string) => ({
  exerciseId,
  slot: 'main',
  sets: 3,
  target: { reps: { min: 8, max: 12 } },
  restSeconds: 90,
});

const TARGETS: NutritionTargets = { calories: 2200, proteinG: 150, carbsG: 250, fatG: 70 };
const PLAN: WorkoutPlan = {
  sessions: [
    {
      weekday: 1,
      type: 'upper',
      exercises: ['bench', 'row', 'press', 'curl', 'dip', 'fly'].map(exercise),
      finisher: null,
      estimatedMinutes: 50,
    },
    {
      weekday: 4,
      type: 'lower',
      exercises: ['squat', 'deadlift'].map(exercise),
      finisher: null,
      estimatedMinutes: 40,
    },
  ],
};
const NAMES: Record<string, string> = {
  bench: 'Bench press',
  row: 'Barbell row',
  press: 'Overhead press',
  curl: 'Biceps curl',
  dip: 'Dip',
  fly: 'Chest fly',
  squat: 'Squat',
  deadlift: 'Deadlift',
};

const ANSWERS: OnboardingAnswers = {
  goal: 'lose_fat',
  weightKg: 80,
  targetWeightKg: 75,
  weeklyPaceKg: 0.5,
  weightUnit: 'kg',
  targets: TARGETS,
  plan: PLAN,
};

describe('PlanStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExercises.mockImplementation((ids: string[]) =>
      Promise.resolve({
        data: ids.map((id) => ({
          id,
          name: NAMES[id],
          exercise_translations: [{ language: 'de', name: `German ${NAMES[id]}` }],
        })),
      }),
    );
    mockStep = createStep(ANSWERS);
  });

  it('shows the daily targets', async () => {
    await render(<PlanStep />);
    expect(screen.getByText('2,200 kcal a day')).toBeTruthy();
    expect(screen.getByText('150 g')).toBeTruthy();
    expect(screen.getByText('250 g')).toBeTruthy();
    expect(screen.getByText('70 g')).toBeTruthy();
    expect(screen.getByText('Protein')).toBeTruthy();
  });

  it('shows one entry per session with its weekday, type and exercises', async () => {
    await render(<PlanStep />);
    expect(screen.getByText('Monday')).toBeTruthy();
    expect(screen.getByText('Upper body')).toBeTruthy();
    expect(screen.getByText('6 exercises · about 50 min')).toBeTruthy();
    expect(screen.getByText('Thursday')).toBeTruthy();
    expect(screen.getByText('Lower body')).toBeTruthy();
    expect(screen.getByText('2 exercises · about 40 min')).toBeTruthy();

    expect(
      await screen.findByText('Bench press · Barbell row · Overhead press · Biceps curl +2 more'),
    ).toBeTruthy();
    expect(screen.getByText('Squat · Deadlift')).toBeTruthy();
    expect(mockExercises).toHaveBeenCalledWith([
      'bench',
      'row',
      'press',
      'curl',
      'dip',
      'fly',
      'squat',
      'deadlift',
    ]);
  });

  it('shows the weight card for losing fat and building muscle only', async () => {
    await render(<PlanStep />);
    expect(screen.getByText('Your weight')).toBeTruthy();
    expect(screen.getByText('80 kg')).toBeTruthy();
    expect(screen.getByText('75 kg')).toBeTruthy();

    mockStep = createStep({ ...ANSWERS, goal: 'build_muscle', targetWeightKg: 83 });
    await screen.rerender(<PlanStep />);
    expect(screen.getByText('Your weight')).toBeTruthy();

    mockStep = createStep({ ...ANSWERS, goal: 'stay_healthy' });
    await screen.rerender(<PlanStep />);
    expect(screen.queryByText('Your weight')).toBeNull();

    mockStep = createStep({ ...ANSWERS, goal: 'get_stronger' });
    await screen.rerender(<PlanStep />);
    expect(screen.queryByText('Your weight')).toBeNull();
  });

  it('saves the onboarding and moves on', async () => {
    jest.mocked(saveOnboarding).mockResolvedValue();
    await render(<PlanStep />);
    await fireEvent.press(screen.getByRole('button', { name: 'Start my plan' }));
    expect(saveOnboarding).toHaveBeenCalledWith(ANSWERS, PLAN);
    expect(mockStep.next).toHaveBeenCalledTimes(1);
  });

  it('shows an error when saving fails and lets the user try again', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(saveOnboarding).mockRejectedValueOnce(new Error('offline'));
    await render(<PlanStep />);
    await fireEvent.press(screen.getByRole('button', { name: 'Start my plan' }));
    await waitFor(() =>
      expect(
        screen.getByText("We couldn't save your plan. Check your connection and try again."),
      ).toBeTruthy(),
    );
    expect(mockStep.next).not.toHaveBeenCalled();

    jest.mocked(saveOnboarding).mockResolvedValueOnce();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(saveOnboarding).toHaveBeenCalledTimes(2);
    expect(mockStep.next).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/We couldn't save your plan/)).toBeNull();
    warn.mockRestore();
  });

  it('builds the plan again when there is none', async () => {
    mockStep = createStep({ ...ANSWERS, plan: undefined });
    await render(<PlanStep />);
    expect(screen.getByText('Redirected to building')).toBeTruthy();
    expect(mockExercises).not.toHaveBeenCalled();
  });

  it('builds the plan again when the targets are missing', async () => {
    mockStep = createStep({ ...ANSWERS, targets: undefined });
    await render(<PlanStep />);
    expect(screen.getByText('Redirected to building')).toBeTruthy();
  });
});
