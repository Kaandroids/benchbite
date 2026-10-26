import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { GoalInsightStep } from './goal-insight';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));
let mockWeightUnit: 'kg' | 'lb' = 'kg';
jest.mock('@/i18n/units', () => ({
  ...jest.requireActual('@/i18n/units'),
  defaultUnits: () => ({ weight: mockWeightUnit, height: 'cm' }),
}));

describe('GoalInsightStep', () => {
  it('shows the chosen goal as a scene, a title and tips', async () => {
    mockStep = createStep({ goal: 'build_muscle' });
    await render(<GoalInsightStep />);
    expect(screen.getByText('Bench press')).toBeTruthy();
    expect(screen.getByText('Week 12')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Muscle is built week by week' })).toBeTruthy();
    expect(screen.getByText(/aim for 7–9 hours/)).toBeTruthy();
  });

  it('speaks to the user by name', async () => {
    mockStep = createStep({ goal: 'lose_fat', displayName: 'Kaan' });
    await render(<GoalInsightStep />);
    expect(
      screen.getByRole('header', { name: 'Kaan, losing fat is about consistency' }),
    ).toBeTruthy();
  });

  it('shows a name with markup in it as it was typed', async () => {
    mockStep = createStep({ goal: 'lose_fat', displayName: '<accent>$&' });
    await render(<GoalInsightStep />);
    expect(
      screen.getByRole('header', { name: '<accent>$&, losing fat is about consistency' }),
    ).toBeTruthy();
  });

  it.each([
    ['lose_fat', 'kg', 'Weight', '−0.5 kg a week on average'],
    ['lose_fat', 'lb', 'Weight', '−1 lb a week on average'],
    ['get_stronger', 'kg', 'Squat', '+2.5 kg at a time'],
    ['get_stronger', 'lb', 'Squat', '+5 lb at a time'],
  ] as const)('shows the %s scene in %s', async (goal, unit, label, note) => {
    mockWeightUnit = unit;
    mockStep = createStep({ goal });
    await render(<GoalInsightStep />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText(note)).toBeTruthy();
  });

  it('shows the stay healthy scene', async () => {
    mockStep = createStep({ goal: 'stay_healthy' });
    await render(<GoalInsightStep />);
    expect(screen.getByText('This week')).toBeTruthy();
    expect(screen.getByLabelText('12-day streak')).toBeTruthy();
  });

  it('moves on with Continue', async () => {
    mockStep = createStep({ goal: 'lose_fat' });
    await render(<GoalInsightStep />);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockStep.next).toHaveBeenCalledTimes(1);
  });
});
