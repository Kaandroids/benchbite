import { fireEvent, render, screen } from '@/test/render';

import { SessionEnded } from './session-ended';

jest.mock('@/account/create-account-screen', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    CreateAccountScreen: ({ onClose }: { onClose: () => void }) => (
      <MockText onPress={onClose}>Create account screen</MockText>
    ),
  };
});
jest.mock('@/account/log-in-screen', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LogInScreen: ({
      onClose,
      leavesGuestData,
    }: {
      onClose: () => void;
      leavesGuestData: boolean;
    }) => <MockText onPress={onClose}>{`Log in screen ${leavesGuestData}`}</MockText>,
  };
});

describe('SessionEnded', () => {
  it('explains that the data is out of reach, and starts again', async () => {
    const startAgain = jest.fn(() => Promise.resolve());
    await render(<SessionEnded reason="guest" onStartAgain={startAgain} />);
    expect(screen.getByText('Your guest session ended')).toBeTruthy();
    expect(screen.getByText(/can’t be opened here anymore/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Start again' }));
    expect(startAgain).toHaveBeenCalledTimes(1);
  });

  it('opens the account forms in place, and comes back from them', async () => {
    const startAgain = jest.fn(() => Promise.resolve());
    await render(<SessionEnded reason="guest" onStartAgain={startAgain} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Create an account' }));
    await fireEvent.press(screen.getByText('Create account screen'));
    // Nothing on this device is left behind by logging in.
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    await fireEvent.press(screen.getByText('Log in screen false'));
    expect(screen.getByText('Your guest session ended')).toBeOnTheScreen();
    expect(startAgain).not.toHaveBeenCalled();
  });

  it('tells an account it was signed out on this device, to log in again or go on as a guest', async () => {
    const startAgain = jest.fn(() => Promise.resolve());
    await render(<SessionEnded reason="account" onStartAgain={startAgain} />);
    expect(screen.getByText('You’re signed out on this device')).toBeOnTheScreen();
    expect(
      screen.getByText(/may have been deleted, or signed out on another device/),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Your guest session ended')).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByText('Log in screen false')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Log in screen false'));

    await fireEvent.press(screen.getByRole('button', { name: 'Continue as guest' }));
    expect(startAgain).toHaveBeenCalledTimes(1);
  });

  it('tells an account it was deleted, to go on as a guest or create a new one', async () => {
    const startAgain = jest.fn(() => Promise.resolve());
    await render(<SessionEnded reason="deleted" onStartAgain={startAgain} />);
    expect(screen.getByText('Your account was deleted')).toBeOnTheScreen();
    expect(screen.getByText(/deleted on the website, with everything in it/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Create an account' }));
    expect(screen.getByText('Create account screen')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Create account screen'));

    await fireEvent.press(screen.getByRole('button', { name: 'Continue as guest' }));
    expect(startAgain).toHaveBeenCalledTimes(1);
  });
});
