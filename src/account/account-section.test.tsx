import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { Alert, type AlertButton } from 'react-native';

import { useIsAccount, useSession } from '@/providers/session-provider';
import { sessionValue } from '@/test/context-mocks';
import { fireEvent, render, screen, waitFor } from '@/test/render';

import { AccountSection } from './account-section';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/providers/session-provider', () => ({
  useSession: jest.fn(),
  useIsAccount: jest.fn(),
}));

const signOut = jest.fn();

function given(isAccount: boolean) {
  const value = sessionValue('user-1', { isAnonymous: !isAccount, signOut });
  if (value.status === 'ready' && isAccount) {
    value.session.user.email = 'kaan@example.com';
  }
  jest.mocked(useSession).mockReturnValue(value);
  jest.mocked(useIsAccount).mockReturnValue(isAccount);
}

/** Taps the button of the alert shown last that has the given text. */
function tapAlertButton(text: string) {
  const buttons = jest.mocked(Alert.alert).mock.lastCall?.[2] as AlertButton[];
  buttons.find((button) => button.text === text)?.onPress?.();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  signOut.mockResolvedValue(undefined);
});

describe('AccountSection', () => {
  it('offers a guest to create an account or log in', async () => {
    given(false);
    await render(<AccountSection />);
    expect(screen.getByText('You’re using Benchbite as a guest')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Create an account' }));
    expect(router.push).toHaveBeenCalledWith('/account/create');
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    expect(router.push).toHaveBeenCalledWith('/account/login');
  });

  it('shows the account and logs out once confirmed', async () => {
    given(true);
    await render(<AccountSection />);
    expect(screen.getByText('kaan@example.com')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Log out' }));
    expect(Alert.alert).toHaveBeenCalledWith('Log out?', expect.any(String), expect.any(Array));
    expect(signOut).not.toHaveBeenCalled();
    tapAlertButton('Log out');
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  it('says why logging out failed', async () => {
    given(true);
    signOut.mockRejectedValue(new AuthRetryableFetchError('Failed to fetch', 0));
    await render(<AccountSection />);
    await fireEvent.press(screen.getByRole('button', { name: 'Log out' }));
    tapAlertButton('Log out');
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'Couldn’t log out',
        'No connection. Check your internet and try again.',
      ),
    );
  });
});
