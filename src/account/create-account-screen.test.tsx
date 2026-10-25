import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { sessionValue } from '@/test/context-mocks';
import { act, fireEvent, render, screen, waitFor } from '@/test/render';

import { CreateAccountScreen } from './create-account-screen';

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { updateUser: jest.fn(), signUp: jest.fn() } },
}));
jest.mock('@/providers/session-provider', () => ({ useSession: jest.fn() }));

const auth = jest.mocked(supabase.auth);
const onClose = jest.fn();
const onLogIn = jest.fn();
const onCreated = jest.fn();

function renderScreen() {
  return render(<CreateAccountScreen onClose={onClose} onLogIn={onLogIn} onCreated={onCreated} />);
}

async function fill(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useSession).mockReturnValue(sessionValue('guest'));
  auth.updateUser.mockResolvedValue({ data: {}, error: null } as never);
});

describe('CreateAccountScreen', () => {
  it('turns the button on once the email and a long enough password are in', async () => {
    await renderScreen();
    const button = screen.getByRole('button', { name: 'Create account' });
    expect(button).toBeDisabled();
    await fill('kaan@example.com', 'short');
    expect(button).toBeDisabled();
    await fill('kaan@example.com', 'secret12');
    expect(button).toBeEnabled();
  });

  it('creates the account and reports it', async () => {
    await renderScreen();
    await fill('kaan@example.com', 'secret12');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(auth.updateUser).toHaveBeenCalledWith({
      email: 'kaan@example.com',
      password: 'secret12',
    });
  });

  it('shows a taken email under the field, with a way to log in instead', async () => {
    auth.updateUser.mockResolvedValue({
      data: {},
      error: new AuthApiError('taken', 422, 'email_exists'),
    } as never);
    await renderScreen();
    await fill('kaan@example.com', 'secret12');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(
      await screen.findByText('There’s already an account with this email.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Log in instead' }));
    expect(onLogIn).toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('names the password limit in its error', async () => {
    auth.updateUser.mockResolvedValue({
      data: {},
      error: new AuthApiError('weak', 422, 'weak_password'),
    } as never);
    await renderScreen();
    await fill('kaan@example.com', 'secret12');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Use a password with at least 6 characters.')).toBeOnTheScreen();
  });

  it('shows an error that is not about a field above the button, until the next change', async () => {
    auth.updateUser.mockResolvedValue({
      data: {},
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    } as never);
    await renderScreen();
    await fill('kaan@example.com', 'secret12');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No connection. Check your internet and try again.',
    );
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  it('keeps what is being sent, and reports the answer', async () => {
    let answer: (value: unknown) => void = () => {};
    auth.updateUser.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }) as never,
    );
    await renderScreen();
    await fill('kaan@example.com', 'secret12');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(screen.getByLabelText('Password')).toHaveProp('editable', false));
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
    await act(async () => answer({ data: {}, error: null }));
    expect(onCreated).toHaveBeenCalled();
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
  });

  it('closes, and switches to logging in', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    expect(onLogIn).toHaveBeenCalled();
  });
});
