import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { NicknameStep } from './nickname';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const field = () => screen.getByLabelText('Name');
const continueButton = () => screen.getByRole('button', { name: 'Continue' });

describe('NicknameStep', () => {
  it('saves the name without the spaces around it', async () => {
    mockStep = createStep();
    await render(<NicknameStep />);
    expect(continueButton()).toBeDisabled();
    await fireEvent.changeText(field(), '  Kaan ');
    await fireEvent.press(continueButton());
    expect(mockStep.next).toHaveBeenCalledWith({ displayName: 'Kaan' });
  });

  it('can be skipped, which drops a name given before', async () => {
    mockStep = createStep({ displayName: 'Kaan' });
    await render(<NicknameStep />);
    expect(field()).toHaveDisplayValue('Kaan');
    await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    expect(mockStep.next).toHaveBeenCalledWith({ displayName: undefined });
  });

  it('does not move on with only spaces', async () => {
    mockStep = createStep();
    await render(<NicknameStep />);
    await fireEvent.changeText(field(), '   ');
    expect(continueButton()).toBeDisabled();
  });
});
