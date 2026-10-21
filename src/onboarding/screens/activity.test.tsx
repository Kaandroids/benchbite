import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { ActivityStep } from './activity';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

describe('ActivityStep', () => {
  it('chooses the tapped answer', async () => {
    mockStep = createStep();
    await render(<ActivityStep />);
    await fireEvent.press(
      screen.getByRole('radio', { name: 'Very active, Physical work all day' }),
    );
    expect(mockStep.choose).toHaveBeenCalledWith({ activityLevel: 'active' });
  });

  it('shows the current answer as selected', async () => {
    mockStep = createStep({ activityLevel: 'sedentary' });
    await render(<ActivityStep />);
    expect(
      screen.getByRole('radio', { name: 'Mostly sitting, Desk job, little walking' }),
    ).toBeChecked();
    expect(
      screen.getByRole('radio', { name: 'Very active, Physical work all day' }),
    ).not.toBeChecked();
  });
});
