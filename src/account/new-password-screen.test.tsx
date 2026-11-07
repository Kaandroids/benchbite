import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { sessionValue } from '@/test/context-mocks';
import { fireEvent, render, screen, waitFor } from '@/test/render';

import { NewPasswordScreen } from './new-password-screen';

jest.mock('@/lib/supabase', () => ({ supabase: { auth: { updateUser: jest.fn() } } }));
jest.mock('@/providers/session-provider', () => ({ useSession: jest.fn() }));

const auth = jest.mocked(supabase.auth);
const passwordChosen = jest.fn();

async function save(password: string) {
  await render(<NewPasswordScreen />);
  await fireEvent.changeText(screen.getByLabelText('New password'), password);
  await fireEvent.press(screen.getByRole('button', { name: 'Save password' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(useSession)
    .mockReturnValue(
      sessionValue('user-1', { isAnonymous: false, recovering: true, passwordChosen }),
    );
  auth.updateUser.mockResolvedValue({ data: {}, error: null } as never);
});

describe('NewPasswordScreen', () => {
  it('saves the new password, then lets the app go on', async () => {
    await save('a new one!');
    await waitFor(() => expect(passwordChosen).toHaveBeenCalled());
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'a new one!' });
  });

  it('waits for a password long enough', async () => {
    await render(<NewPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText('New password'), 'short');
    expect(screen.getByRole('button', { name: 'Save password' })).toBeDisabled();
  });

  it('goes on with the password the account had, which the person knows', async () => {
    auth.updateUser.mockResolvedValue({
      data: {},
      error: new AuthApiError('same', 422, 'same_password'),
    } as never);
    await save('the old one');
    await waitFor(() => expect(passwordChosen).toHaveBeenCalled());
  });

  it('shows a refused password under the field, and other errors above the button', async () => {
    auth.updateUser.mockResolvedValueOnce({
      data: {},
      error: new AuthApiError('weak', 422, 'weak_password'),
    } as never);
    await save('a new one!');
    expect(await screen.findByText('Use a password with at least 8 characters.')).toBeOnTheScreen();
    // The field's error is the only alert, with none above the button.
    expect(screen.getAllByRole('alert')).toHaveLength(1);

    auth.updateUser.mockResolvedValueOnce({
      data: {},
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    } as never);
    await fireEvent.press(screen.getByRole('button', { name: 'Save password' }));
    expect(
      await screen.findByText('No connection. Check your internet and try again.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Use a password with at least 8 characters.')).not.toBeOnTheScreen();
    expect(passwordChosen).not.toHaveBeenCalled();
  });

  it('offers no way back', async () => {
    await render(<NewPasswordScreen />);
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeOnTheScreen();
  });
});
