import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { WeightStep } from './weight';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

const LABEL = 'What do you weigh?';

/** The wheel of whole numbers and the wheel of tenths. */
const wheels = () => screen.getAllByRole('adjustable', { name: LABEL });

function wheelAction(index: number, actionName: 'increment' | 'decrement') {
  return fireEvent(wheels()[index]!, 'accessibilityAction', { nativeEvent: { actionName } });
}

describe('WeightStep', () => {
  it('starts from a typical weight for the sex', async () => {
    mockStep = createStep({ sex: 'male', weightUnit: 'kg' });
    await render(<WeightStep />);
    expect(wheels()[0]).toHaveAccessibilityValue({ text: '80.0 kg' });
  });

  it('keeps the weight when switching between kilograms and pounds', async () => {
    mockStep = createStep({ weightKg: 80, weightUnit: 'kg' });
    await render(<WeightStep />);

    await fireEvent.press(screen.getByRole('radio', { name: 'lb' }));
    expect(wheels()[0]).toHaveAccessibilityValue({ text: '176.4 lb' });

    await fireEvent.press(screen.getByRole('radio', { name: 'kg' }));
    expect(wheels()[0]).toHaveAccessibilityValue({ text: '80.0 kg' });
  });

  it('saves a weight picked in pounds in kilograms', async () => {
    mockStep = createStep({ weightKg: 80, weightUnit: 'lb' });
    await render(<WeightStep />);
    // From 176.4 lb to 176.5 lb.
    await wheelAction(1, 'increment');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    // 176.5 lb is 80.06 kg.
    expect(mockStep.next).toHaveBeenCalledWith({ weightKg: 80.1, weightUnit: 'lb' });
  });

  it('saves the whole and tenth wheels together', async () => {
    mockStep = createStep({ weightKg: 72.5, weightUnit: 'kg' });
    await render(<WeightStep />);
    await wheelAction(0, 'increment');
    await wheelAction(1, 'decrement');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockStep.next).toHaveBeenCalledWith({ weightKg: 73.4, weightUnit: 'kg' });
  });
});
