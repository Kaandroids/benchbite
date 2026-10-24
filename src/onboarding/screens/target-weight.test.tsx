import { router } from 'expo-router';

import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { TargetWeightStep } from './target-weight';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

jest.mock('expo-router', () => ({ router: { dismissTo: jest.fn() } }));

const LABEL = "What's your target weight?";

const wholeWheel = () => screen.getAllByRole('adjustable', { name: LABEL })[0]!;
const continueButton = () => screen.getByRole('button', { name: 'Continue' });

function wheelAction(actionName: 'increment' | 'decrement') {
  return fireEvent(wholeWheel(), 'accessibilityAction', { nativeEvent: { actionName } });
}

// At 180 cm, a BMI of 18.5 is 59.94 kg, so the lowest healthy target is 60 kg.
const BODY = { weightKg: 80, heightCm: 180, weightUnit: 'kg' } as const;

describe('TargetWeightStep', () => {
  it('suggests 5 kg less for losing fat', async () => {
    mockStep = createStep({ ...BODY, goal: 'lose_fat' });
    await render(<TargetWeightStep />);
    expect(wholeWheel()).toHaveAccessibilityValue({ text: '75.0 kg' });
    expect(screen.getByText('−5 kg from now')).toBeTruthy();
    await fireEvent.press(continueButton());
    expect(mockStep.next).toHaveBeenCalledWith({ targetWeightKg: 75 });
  });

  it('suggests 3 kg more for building muscle', async () => {
    mockStep = createStep({ ...BODY, goal: 'build_muscle' });
    await render(<TargetWeightStep />);
    expect(screen.getByText('+3 kg from now')).toBeTruthy();
    await fireEvent.press(continueButton());
    expect(mockStep.next).toHaveBeenCalledWith({ targetWeightKg: 83 });
  });

  it('requires a target below the current weight for losing fat', async () => {
    mockStep = createStep({ ...BODY, goal: 'lose_fat', targetWeightKg: 79 });
    await render(<TargetWeightStep />);
    await wheelAction('increment');
    expect(
      screen.getByText('To lose fat, your target has to be below your current weight.'),
    ).toBeTruthy();
    expect(continueButton()).toBeDisabled();
  });

  it('requires a target above the current weight for building muscle', async () => {
    mockStep = createStep({ ...BODY, goal: 'build_muscle', targetWeightKg: 81 });
    await render(<TargetWeightStep />);
    expect(continueButton()).toBeEnabled();
    await wheelAction('decrement');
    expect(
      screen.getByText('To build muscle, your target has to be above your current weight.'),
    ).toBeTruthy();
    expect(continueButton()).toBeDisabled();
  });

  it('says when a target in pounds is too close to be saved apart from the weight', async () => {
    // 176.3 lb and 176.4 lb, both saved as 80.0 kg.
    mockStep = createStep({
      ...BODY,
      weightUnit: 'lb',
      weightKg: 79.97,
      goal: 'build_muscle',
      targetWeightKg: 80.01,
    });
    await render(<TargetWeightStep />);
    expect(
      screen.getByText(
        'This is too close to your current weight. Choose a target a little further away.',
      ),
    ).toBeTruthy();
    expect(continueButton()).toBeDisabled();
  });

  it('blocks a target below a healthy weight and offers the lowest healthy one', async () => {
    mockStep = createStep({ ...BODY, goal: 'lose_fat', targetWeightKg: 59 });
    await render(<TargetWeightStep />);
    expect(
      screen.getByText(
        'This is below a healthy weight for your height. The lowest healthy target is 60 kg.',
      ),
    ).toBeTruthy();
    expect(continueButton()).toBeDisabled();

    await fireEvent.press(screen.getByRole('button', { name: 'Make 60 kg my target' }));
    expect(wholeWheel()).toHaveAccessibilityValue({ text: '60.0 kg' });
    expect(screen.getByText('−20 kg from now')).toBeTruthy();
    await fireEvent.press(continueButton());
    expect(mockStep.next).toHaveBeenCalledWith({ targetWeightKg: 60 });
  });

  it('starts at the lowest healthy weight when 5 kg less would be below it', async () => {
    mockStep = createStep({ ...BODY, weightKg: 62, goal: 'lose_fat' });
    await render(<TargetWeightStep />);
    expect(wholeWheel()).toHaveAccessibilityValue({ text: '60.0 kg' });
    expect(continueButton()).toBeEnabled();
  });

  it('allows any higher target for building muscle, even with a low weight', async () => {
    mockStep = createStep({ ...BODY, weightKg: 55, goal: 'build_muscle' });
    await render(<TargetWeightStep />);
    expect(screen.getByText('+5 kg from now')).toBeTruthy();
    expect(continueButton()).toBeEnabled();
  });

  it('advises against losing fat at the lower end of a healthy weight', async () => {
    mockStep = createStep({ ...BODY, weightKg: 60, goal: 'lose_fat' });
    await render(<TargetWeightStep />);
    expect(screen.getByText(/losing fat is not recommended/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose another goal' }));
    expect(router.dismissTo).toHaveBeenCalledWith({
      pathname: '/onboarding/[step]',
      params: { step: 'goal' },
    });
  });

  it('shows the target in pounds for users of pounds', async () => {
    mockStep = createStep({ ...BODY, weightUnit: 'lb', goal: 'lose_fat', targetWeightKg: 50 });
    await render(<TargetWeightStep />);
    expect(screen.getByRole('button', { name: 'Make 132.3 lb my target' })).toBeTruthy();
  });
});
