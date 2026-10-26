import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { ActivityStep } from './activity';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

const VERY_ACTIVE = 'Very active, Physical work all day';
const continueButton = () => screen.getByRole('button', { name: 'Continue' });

describe('ActivityStep', () => {
  it('saves the tapped answer without moving on', async () => {
    mockStep = createStep();
    await render(<ActivityStep />);
    expect(screen.getByText(/Workouts are counted separately/)).toBeTruthy();
    expect(continueButton()).toBeDisabled();
    await fireEvent.press(screen.getByRole('radio', { name: VERY_ACTIVE }));
    expect(mockStep.answer).toHaveBeenCalledWith({ activityLevel: 'active' });
    expect(mockStep.next).not.toHaveBeenCalled();
  });

  it('says what the chosen level adds to the calories, then moves on', async () => {
    mockStep = createStep({ activityLevel: 'light' });
    await render(<ActivityStep />);
    expect(
      screen.getByRole('radio', { name: 'Lightly active, On your feet some of the day' }),
    ).toBeChecked();
    expect(screen.getByText('15% more than mostly sitting')).toBeTruthy();
    await fireEvent.press(continueButton());
    expect(mockStep.next).toHaveBeenCalledTimes(1);
  });

  it('calls mostly sitting the starting point', async () => {
    mockStep = createStep({ activityLevel: 'sedentary' });
    await render(<ActivityStep />);
    expect(screen.getByText('The starting point for your calories')).toBeTruthy();
  });

  it('says workouts add nothing to the highest level', async () => {
    mockStep = createStep({ activityLevel: 'active' });
    await render(<ActivityStep />);
    expect(screen.queryByText('Your workouts are added on top.')).toBeNull();
    expect(
      screen.getByText('Hard work all day already counts for more than workouts add.'),
    ).toBeTruthy();
  });
});
