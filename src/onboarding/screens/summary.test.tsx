import type { NutritionTargets, WorkoutPlan } from '@/onboarding/plan';
import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { SummaryStep } from './summary';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

const TARGETS: NutritionTargets = { calories: 2200, proteinG: 150, carbsG: 250, fatG: 70 };

const session = (weekday: number, type: WorkoutPlan['sessions'][number]['type']) => ({
  weekdays: [weekday],
  type,
  exercises: [],
  estimatedMinutes: 45,
});

const plan = (...sessions: WorkoutPlan['sessions']): WorkoutPlan => ({ sessions });

// A Wednesday.
const WEDNESDAY = new Date(2026, 9, 21, 9, 0);

describe('SummaryStep', () => {
  beforeEach(() => jest.useFakeTimers({ now: WEDNESDAY }));
  afterEach(() => jest.useRealTimers());

  it('shows the calories, the workouts per week and the reminder time', async () => {
    mockStep = createStep({
      targets: TARGETS,
      plan: plan(session(1, 'push'), session(3, 'pull'), session(5, 'legs')),
      reminderMinutes: 18 * 60,
    });
    await render(<SummaryStep />);
    expect(screen.getByText('2,200 kcal a day')).toBeTruthy();
    expect(screen.getByText('3 workouts a week')).toBeTruthy();
    expect(screen.getByText(/^Reminders at 6:00\sPM$/)).toBeTruthy();
  });

  it('says when there are no reminders, and counts a single workout', async () => {
    mockStep = createStep({ targets: TARGETS, plan: plan(session(1, 'full_body')) });
    await render(<SummaryStep />);
    expect(screen.getByText('No reminders')).toBeTruthy();
    expect(screen.getByText('1 workout a week')).toBeTruthy();
  });

  it('shows a workout today as Today', async () => {
    mockStep = createStep({ plan: plan(session(1, 'push'), session(3, 'pull')) });
    await render(<SummaryStep />);
    expect(screen.getByText('Today · Pull')).toBeTruthy();
    expect(screen.getByText('0 exercises · about 45 min')).toBeTruthy();
  });

  it('counts a single exercise in the singular', async () => {
    const row = {
      exerciseId: 'row',
      slot: 'horizontal_pull' as const,
      sets: 3,
      target: { reps: { min: 8, max: 12 } },
      restSeconds: 90,
    };
    mockStep = createStep({ plan: plan({ ...session(3, 'pull'), exercises: [row] }) });
    await render(<SummaryStep />);
    expect(screen.getByText('1 exercise · about 45 min')).toBeTruthy();
  });

  it('shows a workout tomorrow as Tomorrow', async () => {
    mockStep = createStep({ plan: plan(session(1, 'push'), session(4, 'legs')) });
    await render(<SummaryStep />);
    expect(screen.getByText('Tomorrow · Legs')).toBeTruthy();
  });

  it('names the weekday of a later workout, also in the next week', async () => {
    mockStep = createStep({ plan: plan(session(1, 'upper'), session(2, 'lower')) });
    await render(<SummaryStep />);
    expect(screen.getByText('Monday · Upper body')).toBeTruthy();
  });

  it('opens the app with Let’s go', async () => {
    mockStep = createStep({ targets: TARGETS, plan: plan(session(1, 'push')) });
    await render(<SummaryStep />);
    await fireEvent.press(screen.getByRole('button', { name: "Let's go" }));
    expect(mockStep.next).toHaveBeenCalledTimes(1);
  });

  it('has no back button', async () => {
    mockStep = createStep({ targets: TARGETS, plan: plan(session(1, 'push')) });
    await render(<SummaryStep />);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });
});
