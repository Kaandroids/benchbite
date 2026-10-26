import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { TrainingIntroStep } from './training-intro';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

describe('TrainingIntroStep', () => {
  it('says half is done and how many questions are left', async () => {
    mockStep = createStep({ displayName: 'Kaan' });
    await render(<TrainingIntroStep />);
    expect(screen.getByLabelText('About you is done. Your training is next.')).toBeTruthy();
    expect(
      screen.getByRole('header', { name: 'Nice work, Kaan. Now your training.' }),
    ).toBeTruthy();
    expect(
      screen.getByText('4 quick questions about how you train, and your plan is ready.'),
    ).toBeTruthy();
  });

  it('does without a name', async () => {
    mockStep = createStep();
    await render(<TrainingIntroStep />);
    expect(screen.getByRole('header', { name: 'Nice work. Now your training.' })).toBeTruthy();
  });

  it('moves on with Continue', async () => {
    mockStep = createStep();
    await render(<TrainingIntroStep />);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockStep.next).toHaveBeenCalledTimes(1);
  });
});
