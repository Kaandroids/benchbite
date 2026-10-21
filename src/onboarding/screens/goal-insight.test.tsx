import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { GoalInsightStep } from './goal-insight';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

describe('GoalInsightStep', () => {
  it('explains the chosen goal', async () => {
    mockStep = createStep({ goal: 'build_muscle' });
    await render(<GoalInsightStep />);
    expect(screen.getByText('Muscle grows with time and protein')).toBeTruthy();
  });

  it('moves on with Continue', async () => {
    mockStep = createStep({ goal: 'lose_fat' });
    await render(<GoalInsightStep />);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockStep.next).toHaveBeenCalledTimes(1);
  });
});
