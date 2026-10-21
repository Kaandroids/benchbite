import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { SexStep } from './sex';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

describe('SexStep', () => {
  it('chooses the tapped answer', async () => {
    mockStep = createStep();
    await render(<SexStep />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Prefer not to say' }));
    expect(mockStep.choose).toHaveBeenCalledWith({ sex: 'unspecified' });
  });

  it('shows the current answer as selected', async () => {
    mockStep = createStep({ sex: 'female' });
    await render(<SexStep />);
    expect(screen.getByRole('radio', { name: 'Female' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Prefer not to say' })).not.toBeChecked();
  });
});
