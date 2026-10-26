import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { ExperienceStep } from './experience';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

const ADVANCED = 'Advanced, Training for years and confident with the main lifts';
const continueButton = () => screen.getByRole('button', { name: 'Continue' });

describe('ExperienceStep', () => {
  it('saves the tapped answer without moving on', async () => {
    mockStep = createStep();
    await render(<ExperienceStep />);
    expect(continueButton()).toBeDisabled();
    await fireEvent.press(screen.getByRole('radio', { name: ADVANCED }));
    expect(mockStep.answer).toHaveBeenCalledWith({ experience: 'advanced' });
    expect(mockStep.next).not.toHaveBeenCalled();
  });

  it.each([
    ['beginner', '3 days · Full body', '3 sets each'],
    ['intermediate', '4 days · Upper body, Lower body', '4 sets each'],
    ['advanced', '5 days · Upper body, Lower body, Full body', '4 sets each'],
  ] as const)('shows what %s sets in the plan', async (experience, week, sets) => {
    mockStep = createStep({ goal: 'build_muscle', experience });
    await render(<ExperienceStep />);
    expect(screen.getByText(week)).toBeTruthy();
    expect(screen.getByText(sets)).toBeTruthy();
  });

  it('counts the extra set of advanced strength training', async () => {
    mockStep = createStep({ goal: 'get_stronger', experience: 'advanced' });
    await render(<ExperienceStep />);
    expect(screen.getByText('5 sets each')).toBeTruthy();
  });

  it('moves on with Continue', async () => {
    mockStep = createStep({ experience: 'beginner' });
    await render(<ExperienceStep />);
    await fireEvent.press(continueButton());
    expect(mockStep.next).toHaveBeenCalledTimes(1);
  });
});
