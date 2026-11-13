import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { useSession, useUserEmail } from '@/providers/session-provider';
import { sessionValue } from '@/test/context-mocks';
import { fireEvent, render, screen, waitFor } from '@/test/render';

import { ChangePasswordScreen } from './change-password-screen';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
      signInWithPassword: jest.fn(),
      updateUser: jest.fn(),
      resetPasswordForEmail: jest.fn(),
    },
  },
}));
jest.mock('@/providers/session-provider', () => ({
  useSession: jest.fn(),
  useUserEmail: jest.fn(),
}));

const auth = jest.mocked(supabase.auth);
const onBack = jest.fn();
const onChanged = jest.fn();

async function renderScreen() {
  await render(<ChangePasswordScreen onBack={onBack} onChanged={onChanged} />);
}

async function fill(current: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('Current password'), current);
  await fireEvent.changeText(screen.getByLabelText('New password'), password);
}

const save = () => fireEvent.press(screen.getByRole('button', { name: 'Save password' }));

beforeEach(() => {
  jest.clearAllMocks();
  const value = sessionValue('user-1', { isAnonymous: false });
  if (value.status === 'ready') {
    value.session.user.email = 'kaan@example.com';
  }
  jest.mocked(useSession).mockReturnValue(value);
  jest.mocked(useUserEmail).mockReturnValue('kaan@example.com');
  auth.getUser.mockResolvedValue({
    data: { user: { email: 'kaan@example.com' } },
    error: null,
  } as never);
  auth.signInWithPassword.mockResolvedValue({ data: {}, error: null } as never);
  auth.updateUser.mockResolvedValue({ data: {}, error: null } as never);
  auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null } as never);
});

describe('ChangePasswordScreen', () => {
  it('checks the current password by signing in with it, then saves the new one', async () => {
    await renderScreen();
    await fill('the old one', 'a new one!');
    await save();
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'kaan@example.com',
      password: 'the old one',
    });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'a new one!' });
    expect(auth.signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(
      auth.updateUser.mock.invocationCallOrder[0]!,
    );
  });

  it('waits for the current password and a new one long enough', async () => {
    await renderScreen();
    const button = screen.getByRole('button', { name: 'Save password' });
    await fill('', 'a new one!');
    expect(button).toBeDisabled();
    await fill('the old one', 'short');
    expect(button).toBeDisabled();
    await fill('the old one', 'a new one!');
    expect(button).toBeEnabled();
  });

  it('says under the current password that it is wrong, and changes nothing', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: new AuthApiError('wrong', 400, 'invalid_credentials'),
    } as never);
    await renderScreen();
    await fill('not it', 'a new one!');
    await save();
    expect(await screen.findByText('That isn’t your current password.')).toBeOnTheScreen();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Current password'), 'the old one');
    expect(screen.queryByText('That isn’t your current password.')).not.toBeOnTheScreen();
  });

  it('shows a refused new password under its field, and other errors above the button', async () => {
    auth.updateUser.mockResolvedValueOnce({
      data: {},
      error: new AuthApiError('weak', 422, 'weak_password'),
    } as never);
    await renderScreen();
    await fill('the old one', 'a new one!');
    await save();
    expect(await screen.findByText('Use a password with at least 8 characters.')).toBeOnTheScreen();

    auth.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    } as never);
    await save();
    expect(
      await screen.findByText('No connection. Check your internet and try again.'),
    ).toBeOnTheScreen();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('goes on when the new password is the current one', async () => {
    auth.updateUser.mockResolvedValue({
      data: {},
      error: new AuthApiError('same', 422, 'same_password'),
    } as never);
    await renderScreen();
    await fill('the old one', 'the old one');
    await save();
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('resets a forgotten password from here, starting from the account’s email', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Forgot your password?' }));
    expect(screen.getByText('Reset your password')).toBeOnTheScreen();
    expect(screen.getByLabelText('Email')).toHaveProp('value', 'kaan@example.com');
    // The account signed in is the one reset, never another.
    expect(screen.getByLabelText('Email')).toHaveProp('editable', false);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Current password')).toBeOnTheScreen();
  });

  it('goes back', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });
});
