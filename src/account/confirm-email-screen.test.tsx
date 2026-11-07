import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { act, fireEvent, render, screen, waitFor } from '@/test/render';

import { ConfirmEmailScreen } from './confirm-email-screen';

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { verifyOtp: jest.fn(), updateUser: jest.fn(), resend: jest.fn() } },
}));

const auth = jest.mocked(supabase.auth);
const onBack = jest.fn();
const onConfirmed = jest.fn();
const EMAIL = 'kaan@example.com';

function renderScreen(kind: 'guest' | 'new' = 'guest') {
  return render(
    <ConfirmEmailScreen
      email={EMAIL}
      password="secret12"
      kind={kind}
      onBack={onBack}
      onConfirmed={onConfirmed}
    />,
  );
}

const typeCode = (code: string) =>
  fireEvent.changeText(screen.getByLabelText('6-digit code'), code);

beforeEach(() => {
  jest.clearAllMocks();
  auth.verifyOtp.mockResolvedValue({ data: {}, error: null } as never);
  auth.updateUser.mockResolvedValue({ data: {}, error: null } as never);
  auth.resend.mockResolvedValue({ data: {}, error: null } as never);
});

describe('ConfirmEmailScreen', () => {
  it('says where the code went', async () => {
    await renderScreen();
    expect(screen.getByText(`We sent a 6-digit code to ${EMAIL}.`)).toBeOnTheScreen();
  });

  it('sends the code once all of it is in, then gives the guest their password', async () => {
    await renderScreen();
    await typeCode('12345');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    await typeCode('123456');
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: EMAIL,
      token: '123456',
      type: 'email_change',
    });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'secret12' });
    expect(auth.verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(
      auth.updateUser.mock.invocationCallOrder[0]!,
    );
  });

  it('confirms a new user, who gave their password when signing up', async () => {
    await renderScreen('new');
    await typeCode('123456');
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: EMAIL, token: '123456', type: 'signup' });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('keeps only the digits of what is typed or pasted', async () => {
    await renderScreen();
    await typeCode('12 34-a');
    expect(screen.getByLabelText('6-digit code')).toHaveProp('value', '1234');
  });

  it('says that a code is wrong, without giving the password', async () => {
    auth.verifyOtp.mockResolvedValue({
      data: {},
      error: new AuthApiError('expired', 403, 'otp_expired'),
    } as never);
    await renderScreen();
    await typeCode('123456');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That code isn’t right, or it has expired. Try again, or send a new one.',
    );
    expect(screen.getByLabelText('6-digit code')).toHaveProp('value', '');
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it('does not use the code again when only the password failed', async () => {
    auth.updateUser.mockResolvedValueOnce({
      data: {},
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    } as never);
    await renderScreen();
    await typeCode('123456');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No connection. Check your internet and try again.',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(auth.updateUser).toHaveBeenCalledTimes(2);
  });

  it('tells a guest that they stay one, but not a new user', async () => {
    const note = /You stay a guest/;
    const { unmount } = await renderScreen();
    expect(screen.getByText(note)).toBeOnTheScreen();
    await unmount();
    await renderScreen('new');
    expect(screen.queryByText(note)).not.toBeOnTheScreen();
  });

  describe('sending again', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('waits a minute, sends the same kind of code, and starts waiting again', async () => {
      await renderScreen();
      const waiting = screen.getByRole('button', { name: 'Send again in 1:00' });
      await fireEvent.press(waiting);
      expect(auth.resend).not.toHaveBeenCalled();
      await act(async () => jest.advanceTimersByTime(60_000));
      await fireEvent.press(screen.getByRole('button', { name: 'Send a new code' }));
      await waitFor(() =>
        expect(auth.resend).toHaveBeenCalledWith({ email: EMAIL, type: 'email_change' }),
      );
      expect(await screen.findByRole('button', { name: 'Send again in 1:00' })).toBeOnTheScreen();
    });
  });

  it('goes back to use another email', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Use another email' }));
    expect(onBack).toHaveBeenCalled();
  });
});
