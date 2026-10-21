import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { SessionLengthStep } from './session-length';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

describe('SessionLengthStep', () => {
  it('chooses the tapped answer', async () => {
    mockStep = createStep();
    await render(<SessionLengthStep />);
    await fireEvent.press(screen.getByRole('radio', { name: '75+ min, Time for extra volume' }));
    expect(mockStep.choose).toHaveBeenCalledWith({ sessionMinutes: 75 });
  });

  it('shows the current answer as selected', async () => {
    mockStep = createStep({ sessionMinutes: 30 });
    await render(<SessionLengthStep />);
    expect(
      screen.getByRole('radio', { name: '30 min, Short and focused on the main lifts' }),
    ).toBeChecked();
    expect(screen.getByRole('radio', { name: '75+ min, Time for extra volume' })).not.toBeChecked();
  });
});
