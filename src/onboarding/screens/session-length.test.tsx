import type { Plan } from '@shared/plan/types';

import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { SessionLengthStep } from './session-length';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

const mockGeneratePlan = jest.fn();
jest.mock('@/onboarding/plan', () => ({
  generatePlan: (answers: unknown) => mockGeneratePlan(answers),
}));

/** A plan of one workout with the given exercises and sets, its time split as given. */
function planOf(exercises: number, setsEach: number, main: number, extras: number): Plan {
  return {
    sessions: [
      {
        weekdays: [1, 3, 5],
        type: 'full_body',
        exercises: Array.from({ length: exercises }, (_, index) => ({
          exerciseId: `exercise-${index}`,
          slot: 'squat',
          sets: setsEach,
          target: { reps: { min: 8, max: 12 } },
          restSeconds: 90,
        })),
        estimatedMinutes: 5 + Math.ceil((main + extras) / 60),
        time: { warmUp: 300, main, extras, conditioning: 0 },
        work: { exercises, sets: exercises * setsEach, rest: exercises * (setsEach - 1) * 90 },
      },
    ],
  };
}

const PLANS: Record<number, Plan> = {
  30: planOf(6, 2, 16 * 60, 8 * 60),
  45: planOf(8, 3, 26 * 60, 14 * 60),
  60: planOf(8, 3, 36 * 60, 18 * 60),
  75: planOf(11, 3, 36 * 60, 33 * 60),
};

describe('SessionLengthStep', () => {
  beforeEach(() => {
    mockStep = createStep({
      goal: 'build_muscle',
      experience: 'beginner',
      setup: 'gym',
      trainingDays: [1, 3, 5],
    });
    mockGeneratePlan.mockReset();
    mockGeneratePlan.mockImplementation(async ({ sessionMinutes }: { sessionMinutes: number }) =>
      Promise.resolve(PLANS[sessionMinutes]),
    );
  });

  it('starts at 45 minutes and shows what fits', async () => {
    await render(<SessionLengthStep />);
    expect(screen.getByRole('radio', { name: '45' })).toBeChecked();
    expect(await screen.findByText('8 exercises')).toBeTruthy();
    expect(screen.getByText('24 sets')).toBeTruthy();
    // Each exercise rests between its three sets: 8 × 2 × 90 s.
    expect(screen.getByText('≈ 24 min rest')).toBeTruthy();
    expect(screen.getByText('Main lifts')).toBeTruthy();
    expect(screen.getByText('26 min')).toBeTruthy();
    expect(screen.getByText('14 min')).toBeTruthy();
    // Every length is asked for at once, so switching shows it straight away.
    expect(mockGeneratePlan).toHaveBeenCalledTimes(4);
  });

  it('switches to another length and saves it', async () => {
    await render(<SessionLengthStep />);
    await fireEvent.press(screen.getByRole('radio', { name: '75+' }));
    expect(screen.getByText('75+ min')).toBeTruthy();
    expect(await screen.findByText('11 exercises')).toBeTruthy();
    expect(screen.getByText('33 sets')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockStep.next).toHaveBeenCalledWith({ sessionMinutes: 75 });
  });

  it('keeps the length chosen before', async () => {
    mockStep = createStep({
      goal: 'build_muscle',
      experience: 'beginner',
      setup: 'gym',
      trainingDays: [1, 3, 5],
      sessionMinutes: 30,
    });
    await render(<SessionLengthStep />);
    expect(screen.getByText('30 min')).toBeTruthy();
  });

  it('says what to do when the plan builder cannot be reached', async () => {
    mockGeneratePlan.mockRejectedValue(new Error('offline'));
    await render(<SessionLengthStep />);
    expect(await screen.findByText('Connect to the internet to see what fits.')).toBeTruthy();
    expect(screen.getByText('The main lifts and a few extras')).toBeTruthy();
  });

  it('says the same when the plan builder does not say where the time goes yet', async () => {
    mockGeneratePlan.mockResolvedValue({
      sessions: [{ ...PLANS[45]!.sessions[0]!, time: undefined }],
    });
    await render(<SessionLengthStep />);
    expect(await screen.findByText('Connect to the internet to see what fits.')).toBeTruthy();
  });
});
