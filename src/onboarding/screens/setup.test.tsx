import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { SetupStep } from './setup';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

const BODYWEIGHT = 'Bodyweight only, No equipment, a chair and a sturdy table';
const ANSWERS = { goal: 'lose_fat', experience: 'beginner', trainingDays: [1, 3, 5] } as const;

describe('SetupStep', () => {
  it('saves the tapped answer without moving on', async () => {
    mockStep = createStep({ ...ANSWERS, trainingDays: [1, 3, 5] });
    await render(<SetupStep />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('radio', { name: BODYWEIGHT }));
    expect(mockStep.answer).toHaveBeenCalledWith({ setup: 'bodyweight' });
    expect(mockStep.next).not.toHaveBeenCalled();
  });

  it.each([
    ['dumbbells', 'A pair of dumbbells', 'Dumbbell and bodyweight moves'],
    ['bodyweight', 'Just a chair and a sturdy table', 'Bodyweight moves only'],
  ] as const)('says what %s means for the plan', async (setup, need, exercises) => {
    mockStep = createStep({ ...ANSWERS, trainingDays: [1, 3, 5], setup });
    await render(<SetupStep />);
    expect(screen.getByText(need)).toBeTruthy();
    expect(screen.getByText(exercises)).toBeTruthy();
  });

  it('moves on with Continue', async () => {
    mockStep = createStep({ ...ANSWERS, trainingDays: [1, 3, 5], setup: 'gym' });
    await render(<SetupStep />);
    expect(
      screen.getByRole('radio', { name: 'Gym, Machines, barbells and dumbbells' }),
    ).toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockStep.next).toHaveBeenCalledTimes(1);
  });
});
