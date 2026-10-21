import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { HeightStep } from './height';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

const LABEL = 'How tall are you?';

const wheels = () => screen.getAllByRole('adjustable', { name: LABEL });

function wheelAction(index: number, actionName: 'increment' | 'decrement') {
  return fireEvent(wheels()[index]!, 'accessibilityAction', { nativeEvent: { actionName } });
}

describe('HeightStep', () => {
  it('starts from a typical height for the sex', async () => {
    mockStep = createStep({ sex: 'female', heightUnit: 'cm' });
    await render(<HeightStep />);
    expect(wheels()[0]).toHaveAccessibilityValue({ text: '165 cm' });
  });

  it('keeps the height when switching between centimetres and feet and inches', async () => {
    mockStep = createStep({ heightCm: 178, heightUnit: 'cm' });
    await render(<HeightStep />);
    expect(screen.getByRole('radio', { name: 'cm' })).toBeChecked();

    await fireEvent.press(screen.getByRole('radio', { name: 'ft / in' }));
    expect(wheels()).toHaveLength(2);
    expect(wheels()[0]).toHaveAccessibilityValue({ text: '5 ft' });
    expect(wheels()[1]).toHaveAccessibilityValue({ text: '10 in' });

    await fireEvent.press(screen.getByRole('radio', { name: 'cm' }));
    expect(wheels()[0]).toHaveAccessibilityValue({ text: '178 cm' });
  });

  it('saves a height picked in feet and inches in centimetres', async () => {
    mockStep = createStep({ heightCm: 178, heightUnit: 'ft' });
    await render(<HeightStep />);
    await wheelAction(1, 'increment');
    expect(wheels()[1]).toHaveAccessibilityValue({ text: '11 in' });

    await fireEvent.press(screen.getByRole('radio', { name: 'cm' }));
    expect(wheels()[0]).toHaveAccessibilityValue({ text: '180 cm' });

    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    // 5 ft 11 in is 71 inches, 180.34 cm.
    expect(mockStep.next).toHaveBeenCalledWith({ heightCm: 180.3, heightUnit: 'cm' });
  });

  it('saves a height picked in centimetres', async () => {
    mockStep = createStep({ heightCm: 178, heightUnit: 'cm' });
    await render(<HeightStep />);
    await wheelAction(0, 'decrement');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockStep.next).toHaveBeenCalledWith({ heightCm: 177, heightUnit: 'cm' });
  });
});
