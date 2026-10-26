import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { GoalStep } from './goal';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

const continueButton = () => screen.getByRole('button', { name: 'Continue' });

describe('GoalStep', () => {
  it('saves the tapped goal without moving on', async () => {
    mockStep = createStep();
    await render(<GoalStep />);
    expect(continueButton()).toBeDisabled();
    expect(screen.getByText('Pick a goal to see what it sets in your plan.')).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('radio', { name: 'Build muscle, Gain muscle with a small surplus' }),
    );
    expect(mockStep.answer).toHaveBeenCalledWith({ goal: 'build_muscle' });
    expect(mockStep.next).not.toHaveBeenCalled();
  });

  it('shows what the chosen goal sets in the plan, then moves on', async () => {
    mockStep = createStep({ goal: 'lose_fat' });
    await render(<GoalStep />);
    expect(
      screen.getByRole('radio', { name: 'Lose fat, Burn fat and keep your muscle' }),
    ).toBeChecked();
    expect(screen.getByText('A moderate deficit')).toBeTruthy();
    expect(screen.getByText('Strength to keep your muscle')).toBeTruthy();
    await fireEvent.press(continueButton());
    expect(mockStep.next).toHaveBeenCalledTimes(1);
  });
});
