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

  it('leaves for the welcome screen with the cross', async () => {
    mockStep = createStep();
    await render(<NicknameStep />);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(mockStep.close).toHaveBeenCalled();
  });

  it('can be skipped, which drops a name given before', async () => {
    mockStep = createStep({ displayName: 'Kaan' });
    await render(<NicknameStep />);
    expect(field()).toHaveDisplayValue('Kaan');
    await fireEvent.press(screen.getByRole('button', { name: 'Skip for now' }));
    expect(mockStep.next).toHaveBeenCalledWith({ displayName: undefined });
  });

  it('shows the greeting with the name as it is typed', async () => {
    mockStep = createStep();
    await render(<NicknameStep />);
    await fireEvent.changeText(field(), 'Kaan');
    expect(screen.getByText(/, Kaan$/)).toBeTruthy();
  });

  it('does not move on with only spaces', async () => {
    mockStep = createStep();
    await render(<NicknameStep />);
    await fireEvent.changeText(field(), '   ');
    expect(continueButton()).toBeDisabled();
  });
});
