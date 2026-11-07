import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { act, fireEvent, render, screen, waitFor } from '@/test/render';

import { ForgotPasswordScreen } from './forgot-password-screen';

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { resetPasswordForEmail: jest.fn(), verifyOtp: jest.fn() } },
}));

const auth = jest.mocked(supabase.auth);
const onBack = jest.fn();
const WARNING =
  'What you saved as a guest on this phone won’t move to this account. To keep it, create an account instead.';

function renderScreen(leavesGuestData = false) {
  return render(
    <ForgotPasswordScreen
      email=" kaan@example.com "
      leavesGuestData={leavesGuestData}
      onBack={onBack}
    />,
  );
}

async function sendCode() {
  await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
  return screen.findByText('If kaan@example.com has an account, a 6-digit code is on its way.');
}

const typeCode = (code: string) =>
  fireEvent.changeText(screen.getByLabelText('6-digit code'), code);

beforeEach(() => {
  jest.clearAllMocks();
  auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null } as never);
  auth.verifyOtp.mockResolvedValue({ data: {}, error: null } as never);
});

describe('ForgotPasswordScreen', () => {
  it('starts from the email the log-in form held, and sends the code to it', async () => {
    await renderScreen();
    expect(screen.getByLabelText('Email')).toHaveProp('value', ' kaan@example.com ');
    expect(await sendCode()).toBeOnTheScreen();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('kaan@example.com');
  });

  it('signs in with the whole code, as a reset', async () => {
    await renderScreen();
    await sendCode();
    await typeCode('123456');
    await waitFor(() =>
      expect(auth.verifyOtp).toHaveBeenCalledWith({
        email: 'kaan@example.com',
        token: '123456',
        type: 'recovery',
      }),
    );
  });

  it('says that a code is wrong, and clears it', async () => {
    auth.verifyOtp.mockResolvedValue({
      data: {},
      error: new AuthApiError('expired', 403, 'otp_expired'),
    } as never);
    await renderScreen();
    await sendCode();
    await typeCode('123456');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That code isn’t right, or it has expired. Try again, or send a new one.',
    );
    expect(screen.getByLabelText('6-digit code')).toHaveProp('value', '');
  });

  it('shows why the code could not be sent', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: new AuthApiError('wait', 429, 'over_email_send_rate_limit'),
    } as never);
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We sent a code a moment ago. Try again in a minute.',
    );
  });

  it('goes back from the code to the email, and from there to logging in', async () => {
    await renderScreen();
    await sendCode();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Send code' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('warns a guest with data that it stays behind', async () => {
    await renderScreen(true);
    expect(screen.getByText(WARNING)).toBeOnTheScreen();
  });

  describe('sending again', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('waits a minute, then sends a new code', async () => {
      await renderScreen();
      await sendCode();
      await act(async () => jest.advanceTimersByTime(60_000));
      await fireEvent.press(screen.getByRole('button', { name: 'Send a new code' }));
      await waitFor(() => expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(2));
      expect(await screen.findByRole('button', { name: 'Send again in 1:00' })).toBeOnTheScreen();
    });

    it('clears an error of sending again once the next code is typed', async () => {
      await renderScreen();
      await sendCode();
      auth.resetPasswordForEmail.mockResolvedValueOnce({
        data: {},
        error: new AuthRetryableFetchError('Failed to fetch', 0),
      } as never);
      await act(async () => jest.advanceTimersByTime(60_000));
      await fireEvent.press(screen.getByRole('button', { name: 'Send a new code' }));
      expect(
        await screen.findByText('No connection. Check your internet and try again.'),
      ).toBeOnTheScreen();
      await typeCode('1');
      expect(
        screen.queryByText('No connection. Check your internet and try again.'),
      ).not.toBeOnTheScreen();
    });
  });
});
