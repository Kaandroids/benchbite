import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { TrainingDaysStep } from './training-days';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

const day = (name: string) => screen.getByRole('checkbox', { name });
const selectedDays = () =>
  screen.getAllByRole('checkbox', { checked: true }).map((card) => card.props.accessibilityLabel);
const pressContinue = () => fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

describe('TrainingDaysStep', () => {
  it('selects the recommended days for the experience', async () => {
    mockStep = createStep({ experience: 'intermediate' });
    await render(<TrainingDaysStep />);
    expect(selectedDays()).toEqual(['Monday', 'Tuesday', 'Thursday', 'Friday']);
    expect(screen.getByText('4 days a week · Mon–Tue, Thu–Fri back to back')).toBeTruthy();
  });

  it('follows a changed experience until the user picks days', async () => {
    mockStep = createStep({
      experience: 'advanced',
      trainingDays: [1, 3, 5],
      trainingDaysChosen: false,
    });
    await render(<TrainingDaysStep />);
    expect(selectedDays()).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Friday', 'Saturday']);
  });

  it('keeps days the user picked', async () => {
    mockStep = createStep({
      experience: 'advanced',
      trainingDays: [2, 4],
      trainingDaysChosen: true,
    });
    await render(<TrainingDaysStep />);
    expect(selectedDays()).toEqual(['Tuesday', 'Thursday']);
    expect(screen.getByText('2 days a week · a rest day after each')).toBeTruthy();
  });

  it('saves the recommended days as not chosen', async () => {
    mockStep = createStep({ experience: 'beginner' });
    await render(<TrainingDaysStep />);
    await pressContinue();
    expect(mockStep.next).toHaveBeenCalledWith({
      trainingDays: [1, 3, 5],
      trainingDaysChosen: false,
    });
  });

  it('saves picked days in order and as chosen', async () => {
    mockStep = createStep({ experience: 'beginner' });
    await render(<TrainingDaysStep />);
    await fireEvent.press(day('Sunday'));
    await fireEvent.press(day('Tuesday'));
    await fireEvent.press(day('Monday'));
    expect(screen.getByText('4 days a week · Tue–Wed back to back')).toBeTruthy();
    await pressContinue();
    expect(mockStep.next).toHaveBeenCalledWith({
      trainingDays: [2, 3, 5, 7],
      trainingDaysChosen: true,
    });
  });

  it('keeps at least one day', async () => {
    mockStep = createStep({ trainingDays: [3], trainingDaysChosen: true });
    await render(<TrainingDaysStep />);
    await fireEvent.press(day('Wednesday'));
    expect(day('Wednesday')).toBeChecked();
    expect(screen.getByText('Choose at least one day.')).toBeTruthy();
    // The limit takes the place of the line on the week.
    expect(screen.queryByText(/1 day a week/)).toBeNull();
  });

  it('keeps at least one rest day', async () => {
    mockStep = createStep({ trainingDays: [1, 2, 3, 4, 5, 6], trainingDaysChosen: true });
    await render(<TrainingDaysStep />);
    await fireEvent.press(day('Sunday'));
    expect(day('Sunday')).not.toBeChecked();
    expect(screen.getByText('Keep at least one rest day a week.')).toBeTruthy();
  });

  it('clears the limit message after a valid change', async () => {
    mockStep = createStep({ trainingDays: [1, 2, 3, 4, 5, 6], trainingDaysChosen: true });
    await render(<TrainingDaysStep />);
    await fireEvent.press(day('Sunday'));
    await fireEvent.press(day('Monday'));
    expect(screen.queryByText('Keep at least one rest day a week.')).toBeNull();
  });
});
