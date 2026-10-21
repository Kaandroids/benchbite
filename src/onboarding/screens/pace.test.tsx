import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { PaceStep } from './pace';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

const FASTEST_LOSS =
  'This is the fastest pace we recommend. Losing weight faster mostly costs muscle and is hard to keep up.';
const BODY = { weightKg: 80, targetWeightKg: 75, weightUnit: 'kg' } as const;

function sliderAction(actionName: 'increment' | 'decrement') {
  return fireEvent(
    screen.getByRole('adjustable', { name: 'How fast do you want to get there?' }),
    'accessibilityAction',
    { nativeEvent: { actionName } },
  );
}

describe('PaceStep', () => {
  afterEach(() => jest.useRealTimers());

  it('starts at an ideal pace and projects when the target is reached', async () => {
    jest.useFakeTimers({ now: new Date(2026, 0, 1) });
    mockStep = createStep({ ...BODY, goal: 'lose_fat' });
    await render(<PaceStep />);
    expect(screen.getByText('0.50 kg per week')).toBeTruthy();
    expect(screen.getByText('Ideal: steady and sustainable')).toBeTruthy();
    // 5 kg at 0.5 kg a week takes 10 weeks.
    expect(screen.getByText('You could reach 75 kg by March 12, 2026.')).toBeTruthy();
    expect(screen.queryByText(FASTEST_LOSS)).toBeNull();
  });

  it('notes the fastest recommended pace once it is reached', async () => {
    mockStep = createStep({ ...BODY, goal: 'lose_fat', weeklyPaceKg: 0.85 });
    await render(<PaceStep />);
    expect(screen.queryByText(FASTEST_LOSS)).toBeNull();
    await sliderAction('increment');
    expect(screen.getByText('0.90 kg per week')).toBeTruthy();
    expect(screen.getByText(FASTEST_LOSS)).toBeTruthy();
    expect(screen.getByText('Ambitious: doable, but demanding')).toBeTruthy();
  });

  it('notes the fastest pace for building muscle too', async () => {
    mockStep = createStep({
      ...BODY,
      targetWeightKg: 85,
      goal: 'build_muscle',
      weeklyPaceKg: 0.45,
    });
    await render(<PaceStep />);
    expect(
      screen.getByText(
        'This is the fastest pace we recommend. Gaining weight faster mostly adds fat, not muscle.',
      ),
    ).toBeTruthy();
  });

  it('limits a saved pace that is faster than allowed', async () => {
    mockStep = createStep({ ...BODY, goal: 'lose_fat', weeklyPaceKg: 1.2 });
    await render(<PaceStep />);
    expect(screen.getByText('0.90 kg per week')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockStep.next).toHaveBeenCalledWith({ weeklyPaceKg: 0.9 });
  });

  it('saves the chosen pace', async () => {
    mockStep = createStep({ ...BODY, goal: 'lose_fat' });
    await render(<PaceStep />);
    await sliderAction('decrement');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockStep.next).toHaveBeenCalledWith({ weeklyPaceKg: 0.45 });
  });

  it('saves a pace picked in pounds in kilograms', async () => {
    mockStep = createStep({ ...BODY, weightUnit: 'lb', goal: 'lose_fat' });
    await render(<PaceStep />);
    expect(screen.getByText('1.00 lb per week')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockStep.next).toHaveBeenCalledWith({ weeklyPaceKg: 0.45 });
  });
});
