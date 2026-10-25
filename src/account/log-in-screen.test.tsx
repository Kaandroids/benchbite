import { AuthApiError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { act, fireEvent, render, screen, waitFor } from '@/test/render';

import { LogInScreen } from './log-in-screen';

jest.mock('@/lib/supabase', () => ({ supabase: { auth: { signInWithPassword: jest.fn() } } }));

const auth = jest.mocked(supabase.auth);
const onClose = jest.fn();
const onCreateAccount = jest.fn();
const WARNING =
  'What you saved as a guest on this phone won’t move to this account. To keep it, create an account instead.';

function renderScreen(leavesGuestData = false) {
  return render(
    <LogInScreen
      onClose={onClose}
      onCreateAccount={onCreateAccount}
      leavesGuestData={leavesGuestData}
    />,
  );
}

async function fill(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
}

beforeEach(() => {
  jest.clearAllMocks();
  auth.signInWithPassword.mockResolvedValue({ data: {}, error: null } as never);
});

describe('LogInScreen', () => {
  it('logs in once both fields are filled in', async () => {
    await renderScreen();
    const button = screen.getByRole('button', { name: 'Log in' });
    expect(button).toBeDisabled();
    await fill('kaan@example.com', 'secret12');
    await fireEvent.press(button);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'kaan@example.com',
      password: 'secret12',
    });
  });

  it('shows why it failed, until the next change', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
    } as never);
    await renderScreen();
    await fill('kaan@example.com', 'wrong12');
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That email and password don’t match an account.',
    );
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret12');
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  it('keeps what is being sent, and shows its error', async () => {
    let answer: (value: unknown) => void = () => {};
    auth.signInWithPassword.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }) as never,
    );
    await renderScreen();
    await fill('kaan@example.com', 'wrong12');
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(screen.getByLabelText('Password')).toHaveProp('editable', false));
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret12');
    await act(async () =>
      answer({
        data: {},
        error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That email and password don’t match an account.',
    );
  });

  it('warns a guest with data that it stays behind', async () => {
    await renderScreen(true);
    expect(screen.getByText(WARNING)).toBeOnTheScreen();
  });

  it('does not warn without guest data', async () => {
    await renderScreen();
    expect(screen.queryByText(WARNING)).not.toBeOnTheScreen();
  });

  it('closes, and switches to creating an account', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Create one' }));
    expect(onCreateAccount).toHaveBeenCalled();
  });
});
