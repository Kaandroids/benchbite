import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { ExperienceStep } from './experience';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

describe('ExperienceStep', () => {
  it('chooses the tapped answer', async () => {
    mockStep = createStep();
    await render(<ExperienceStep />);
    await fireEvent.press(
      screen.getByRole('radio', {
        name: 'Advanced, Training for years and confident with the main lifts',
      }),
    );
    expect(mockStep.choose).toHaveBeenCalledWith({ experience: 'advanced' });
  });

  it('shows the current answer as selected', async () => {
    mockStep = createStep({ experience: 'beginner' });
    await render(<ExperienceStep />);
    expect(
      screen.getByRole('radio', {
        name: 'Beginner, New to strength training, or back after a long break',
      }),
    ).toBeChecked();
    expect(
      screen.getByRole('radio', {
        name: 'Advanced, Training for years and confident with the main lifts',
      }),
    ).not.toBeChecked();
  });
});
