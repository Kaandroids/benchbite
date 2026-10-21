import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { WelcomeStep } from './welcome';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

describe('WelcomeStep', () => {
  it('moves on when the user starts', async () => {
    mockStep = createStep();
    await render(<WelcomeStep />);
    expect(screen.getByText('Welcome to Benchbite')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: "Let's get started" }));
    expect(mockStep.next).toHaveBeenCalledTimes(1);
  });
});
