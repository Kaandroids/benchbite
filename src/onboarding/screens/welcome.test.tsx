import { router } from 'expo-router';

import { useIsAccount } from '@/providers/session-provider';
import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { WelcomeStep } from './welcome';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/providers/session-provider', () => ({ useIsAccount: jest.fn(() => false) }));

describe('WelcomeStep', () => {
  it('moves on when the user starts', async () => {
    mockStep = createStep();
    await render(<WelcomeStep />);
    expect(screen.getByText('Welcome to Benchbite')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: "Let's get started" }));
    expect(mockStep.next).toHaveBeenCalledTimes(1);
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
