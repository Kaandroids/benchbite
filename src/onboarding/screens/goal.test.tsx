import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { GoalStep } from './goal';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

describe('GoalStep', () => {
  it('chooses the tapped answer', async () => {
    mockStep = createStep();
    await render(<GoalStep />);
    await fireEvent.press(
      screen.getByRole('radio', { name: 'Build muscle, Gain muscle with a small surplus' }),
    );
    expect(mockStep.choose).toHaveBeenCalledWith({ goal: 'build_muscle' });
  });

  it('shows the current answer as selected', async () => {
    mockStep = createStep({ goal: 'lose_fat' });
    await render(<GoalStep />);
    expect(
      screen.getByRole('radio', { name: 'Lose fat, Burn fat and keep your muscle' }),
    ).toBeChecked();
    expect(
      screen.getByRole('radio', { name: 'Build muscle, Gain muscle with a small surplus' }),
    ).not.toBeChecked();
  });

  it('asks the user by name', async () => {
    mockStep = createStep({ displayName: 'Kaan' });
    await render(<GoalStep />);
    expect(screen.getByRole('header', { name: 'What’s your main goal, Kaan?' })).toBeTruthy();
  });
});
