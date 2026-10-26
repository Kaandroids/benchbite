import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { SexStep } from './sex';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

const continueButton = () => screen.getByRole('button', { name: 'Continue' });

describe('SexStep', () => {
  it('says why it asks and saves the tapped answer without moving on', async () => {
    mockStep = createStep();
    await render(<SexStep />);
    expect(screen.getByText(/how many calories your body burns/)).toBeTruthy();
    expect(
      screen.getByText('Only your calorie targets use it. Your training does not change.'),
    ).toBeTruthy();
    expect(continueButton()).toBeDisabled();
    await fireEvent.press(
      screen.getByRole('radio', { name: "Prefer not to say, We'll use an average" }),
    );
    expect(mockStep.answer).toHaveBeenCalledWith({ sex: 'unspecified' });
    expect(mockStep.next).not.toHaveBeenCalled();
  });

  it('shows the current answer and moves on with Continue', async () => {
    mockStep = createStep({ sex: 'female' });
    await render(<SexStep />);
    expect(screen.getByRole('radio', { name: 'Female' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Male' })).not.toBeChecked();
    await fireEvent.press(continueButton());
    expect(mockStep.next).toHaveBeenCalledTimes(1);
  });

  it('does not save the chosen answer again', async () => {
    mockStep = createStep({ sex: 'male' });
    await render(<SexStep />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Male' }));
    expect(mockStep.answer).not.toHaveBeenCalled();
  });
});
