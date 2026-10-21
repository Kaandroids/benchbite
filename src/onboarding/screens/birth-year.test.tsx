import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { BirthYearStep } from './birth-year';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

const THIS_YEAR = new Date().getFullYear();

const continueButton = () => screen.getByRole('button', { name: 'Continue' });

function wheelAction(actionName: 'increment' | 'decrement') {
  return fireEvent(
    screen.getByRole('adjustable', { name: 'When were you born?' }),
    'accessibilityAction',
    { nativeEvent: { actionName } },
  );
}

describe('BirthYearStep', () => {
  it('starts at the age of 30', async () => {
    mockStep = createStep();
    await render(<BirthYearStep />);
    expect(
      screen.getByRole('adjustable', { name: 'When were you born?' }),
    ).toHaveAccessibilityValue({ text: String(THIS_YEAR - 30) });
    expect(screen.getByText("You're turning 30 this year")).toBeTruthy();
  });

  it('allows someone turning 18 this year', async () => {
    mockStep = createStep({ birthYear: THIS_YEAR - 18 });
    await render(<BirthYearStep />);
    expect(screen.getByText("You're turning 18 this year")).toBeTruthy();
    await fireEvent.press(continueButton());
    expect(mockStep.next).toHaveBeenCalledWith({ birthYear: THIS_YEAR - 18 });
  });

  it('blocks someone under 18 with an explanation', async () => {
    mockStep = createStep({ birthYear: THIS_YEAR - 18 });
    await render(<BirthYearStep />);
    await wheelAction('increment');
    expect(screen.getByText('Benchbite is for people aged 18 and over.')).toBeTruthy();
    expect(continueButton()).toBeDisabled();
    await fireEvent.press(continueButton());
    expect(mockStep.next).not.toHaveBeenCalled();

    await wheelAction('decrement');
    expect(continueButton()).toBeEnabled();
  });
});
