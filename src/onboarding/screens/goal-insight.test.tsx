import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { GoalInsightStep } from './goal-insight';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

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

  it.each(['lose_fat', 'get_stronger', 'stay_healthy'] as const)(
    'has a scene for %s',
    async (goal) => {
      mockStep = createStep({ goal });
      await render(<GoalInsightStep />);
      expect(screen.getByRole('header')).toBeTruthy();
    },
  );

  it('moves on with Continue', async () => {
    mockStep = createStep({ goal: 'lose_fat' });
    await render(<GoalInsightStep />);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockStep.next).toHaveBeenCalledTimes(1);
  });
});
