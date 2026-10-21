import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { TrainingIntroStep } from './training-intro';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

describe('TrainingIntroStep', () => {
  it('moves on with Continue', async () => {
    mockStep = createStep();
    await render(<TrainingIntroStep />);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockStep.next).toHaveBeenCalledTimes(1);
  });
});
