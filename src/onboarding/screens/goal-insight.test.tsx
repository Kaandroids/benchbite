import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { GoalInsightStep } from './goal-insight';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

describe('GoalInsightStep', () => {
  it('explains the chosen goal with its three points', async () => {
    mockStep = createStep({ goal: 'build_muscle' });
    await render(<GoalInsightStep />);
    expect(screen.getByRole('header', { name: 'Muscle is built week by week' })).toBeTruthy();
    expect(screen.getByText('A small calorie surplus')).toBeTruthy();
    expect(screen.getByText('A little more each week')).toBeTruthy();
    expect(screen.getByText('Protein every day')).toBeTruthy();
    expect(screen.getByText('Week 12')).toBeTruthy();
  });

  it('speaks to the user by name', async () => {
    mockStep = createStep({ goal: 'lose_fat', displayName: 'Kaan' });
    await render(<GoalInsightStep />);
    expect(
      screen.getByRole('header', { name: 'Kaan, losing fat is about consistency' }),
    ).toBeTruthy();
  });

  it('moves on with Continue', async () => {
    mockStep = createStep({ goal: 'lose_fat' });
    await render(<GoalInsightStep />);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockStep.next).toHaveBeenCalledTimes(1);
  });
});
