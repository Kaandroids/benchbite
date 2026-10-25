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
    await render(<SessionEnded onStartAgain={startAgain} />);
    expect(screen.getByText('Your guest session ended')).toBeTruthy();
    expect(screen.getByText(/can’t be opened here anymore/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Start again' }));
    expect(startAgain).toHaveBeenCalledTimes(1);
  });

  it('opens the account forms in place, and comes back from them', async () => {
    const startAgain = jest.fn(() => Promise.resolve());
    await render(<SessionEnded onStartAgain={startAgain} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Create an account' }));
    await fireEvent.press(screen.getByText('Create account screen'));
    // Nothing on this device is left behind by logging in.
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    await fireEvent.press(screen.getByText('Log in screen false'));
    expect(screen.getByText('Your guest session ended')).toBeOnTheScreen();
    expect(startAgain).not.toHaveBeenCalled();
  });
});
