import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { SetupStep } from './setup';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

describe('SetupStep', () => {
  it('chooses the tapped answer', async () => {
    mockStep = createStep();
    await render(<SetupStep />);
    await fireEvent.press(
      screen.getByRole('radio', {
        name: 'Bodyweight only, No equipment, a chair and a sturdy table',
      }),
    );
    expect(mockStep.choose).toHaveBeenCalledWith({ setup: 'bodyweight' });
  });

  it('shows the current answer as selected', async () => {
    mockStep = createStep({ setup: 'gym' });
    await render(<SetupStep />);
    expect(
      screen.getByRole('radio', { name: 'Gym, Machines, barbells and dumbbells' }),
    ).toBeChecked();
    expect(
      screen.getByRole('radio', {
        name: 'Bodyweight only, No equipment, a chair and a sturdy table',
      }),
    ).not.toBeChecked();
  });
});
