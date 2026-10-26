import { router } from 'expo-router';

import { useIsAccount } from '@/providers/session-provider';
import { createStep } from '@/test/step-mock';
import { act, fireEvent, render, screen } from '@/test/render';

import { SLIDE_MS } from '../welcome/use-stories';
import { WelcomeStep } from './welcome';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  // The welcome is in focus the whole test.
  useFocusEffect: (effect: () => void) =>
    jest.requireActual<typeof import('react')>('react').useEffect(effect, [effect]),
}));
jest.mock('@/providers/session-provider', () => ({ useIsAccount: jest.fn(() => false) }));

const slides = () => screen.getByRole('adjustable');

describe('WelcomeStep', () => {
  afterEach(() => jest.useRealTimers());

  it('moves on when the user starts', async () => {
    mockStep = createStep();
    await render(<WelcomeStep />);
    expect(screen.getByLabelText('Benchbite')).toBeTruthy();
    expect(screen.getByText('Free to start, no account needed.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: "Let's get started" }));
    expect(mockStep.next).toHaveBeenCalledTimes(1);
  });

  it('steps through the slides', async () => {
    await render(<WelcomeStep />);
    expect(screen.getByText('A plan made for you')).toBeTruthy();
    expect(slides()).toHaveAccessibilityValue({ text: '1 of 4' });

    await fireEvent(slides(), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(screen.getByText('Every set counts')).toBeTruthy();
    await fireEvent(slides(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(screen.getByText('A plan made for you')).toBeTruthy();
  });

  it('plays the slides and starts again after the last', async () => {
    jest.useFakeTimers();
    await render(<WelcomeStep />);
    for (let step = 0; step < 3; step++) {
      await act(() => jest.advanceTimersByTime(SLIDE_MS));
    }
    expect(screen.getByText('See your progress')).toBeTruthy();
    expect(slides()).toHaveAccessibilityValue({ text: '4 of 4' });
    await act(() => jest.advanceTimersByTime(SLIDE_MS));
    expect(screen.getByText('A plan made for you')).toBeTruthy();
  });

  it('opens the log in for someone who has an account', async () => {
    await render(<WelcomeStep />);
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    expect(router.push).toHaveBeenCalledWith('/account/login');
  });

  it('does not offer an account to log in again', async () => {
    jest.mocked(useIsAccount).mockReturnValue(true);
    await render(<WelcomeStep />);
    expect(screen.queryByRole('button', { name: 'Log in' })).not.toBeOnTheScreen();
  });
});
