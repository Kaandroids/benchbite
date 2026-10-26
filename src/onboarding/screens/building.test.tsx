import { calculateTargets, generatePlan, type WorkoutPlan } from '@/onboarding/plan';
import { createStep } from '@/test/step-mock';
import { act, fireEvent, render, screen } from '@/test/render';

import { BuildingStep } from './building';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));
jest.mock('@/onboarding/plan', () => ({ calculateTargets: jest.fn(), generatePlan: jest.fn() }));

const TARGETS = { calories: 2200, proteinG: 150, carbsG: 250, fatG: 70 };
const PLAN: WorkoutPlan = { sessions: [] };
const ANSWERS = {
  goal: 'lose_fat',
  weeklyPaceKg: 0.5,
  weightUnit: 'kg',
  setup: 'gym',
  trainingDays: [1, 3, 5],
  displayName: 'Kaan',
} as const;
const LINES = [
  'Calories for losing 0.5 kg a week',
  'Exercises for the gym',
  '3 workouts: Mon, Wed, Fri',
];
const READY = 'Your plan is ready';
const seeMyPlan = () => screen.queryByRole('button', { name: 'See my plan' });

const advance = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));

describe('BuildingStep', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockStep = createStep({ ...ANSWERS, trainingDays: [...ANSWERS.trainingDays] });
  });

  afterEach(() => jest.useRealTimers());

  it('calculates the targets and the plan from the answers', async () => {
    jest.mocked(calculateTargets).mockResolvedValue(TARGETS);
    jest.mocked(generatePlan).mockResolvedValue(PLAN);
    await render(<BuildingStep />);
    expect(calculateTargets).toHaveBeenCalledWith(mockStep.answers);
    expect(generatePlan).toHaveBeenCalledWith(mockStep.answers);
    expect(screen.getByText('Just a few seconds, Kaan.')).toBeTruthy();
  });

  it('shows a line about the plan at a time, then offers to see it', async () => {
    jest.mocked(calculateTargets).mockResolvedValue(TARGETS);
    jest.mocked(generatePlan).mockResolvedValue(PLAN);
    await render(<BuildingStep />);
    expect(screen.getByText(LINES[0]!)).toBeTruthy();

    await advance(1100);
    expect(screen.getByText(LINES[1]!)).toBeTruthy();
    await advance(1100);
    expect(screen.getByText(LINES[2]!)).toBeTruthy();
    expect(seeMyPlan()).toBeNull();

    await advance(1500);
    expect(screen.getByText(READY)).toBeTruthy();
    // It waits for the user rather than moving on by itself.
    expect(mockStep.next).not.toHaveBeenCalled();
    await fireEvent.press(seeMyPlan()!);
    expect(mockStep.next).toHaveBeenCalledWith({ targets: TARGETS, plan: PLAN });
  });

  it('waits on the last line until the work is done', async () => {
    let finish: (plan: WorkoutPlan) => void = () => {};
    jest.mocked(calculateTargets).mockResolvedValue(TARGETS);
    jest.mocked(generatePlan).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await render(<BuildingStep />);

    await advance(10_000);
    expect(screen.getByText(LINES[2]!)).toBeTruthy();
    expect(seeMyPlan()).toBeNull();

    await act(async () => finish(PLAN));
    await advance(400);
    expect(screen.getByText(READY)).toBeTruthy();
    expect(seeMyPlan()).toBeTruthy();
  });

  it('says what the calories are for when the weight stays', async () => {
    mockStep = createStep({ goal: 'get_stronger', setup: 'bodyweight', trainingDays: [2] });
    jest.mocked(calculateTargets).mockResolvedValue(TARGETS);
    jest.mocked(generatePlan).mockResolvedValue(PLAN);
    await render(<BuildingStep />);
    expect(screen.getByText('Calories to keep your weight')).toBeTruthy();
    expect(screen.getByText('Just a few seconds.')).toBeTruthy();
    await advance(1100);
    expect(screen.getByText('Exercises with your bodyweight')).toBeTruthy();
    await advance(1100);
    expect(screen.getByText('1 workout: Tue')).toBeTruthy();
  });

  it('shows an error on failure and tries again', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(calculateTargets).mockRejectedValueOnce(new Error('offline'));
    jest.mocked(generatePlan).mockResolvedValue(PLAN);
    await render(<BuildingStep />);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();

    await advance(3300);
    expect(
      screen.getByText("We couldn't build your plan. Check your connection and try again."),
    ).toBeTruthy();
    expect(warn).toHaveBeenCalled();
    expect(seeMyPlan()).toBeNull();

    jest.mocked(calculateTargets).mockResolvedValue(TARGETS);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(calculateTargets).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/We couldn't build your plan/)).toBeNull();
    expect(screen.getByText(LINES[0]!)).toBeTruthy();

    await advance(3700);
    expect(seeMyPlan()).toBeTruthy();
    warn.mockRestore();
  });
});
