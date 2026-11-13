import { AuthApiError, FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { router } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { useIsAccount, useSession, useUserEmail } from '@/providers/session-provider';
import { sessionValue } from '@/test/context-mocks';
import { fireEvent, render, screen, waitFor } from '@/test/render';

import { DeleteAccountScreen } from './delete-account-screen';

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    auth: {
      getUser: jest.fn(),
      getSession: jest.fn(),
      signInWithPassword: jest.fn(),
      admin: { signOut: jest.fn() },
    },
  },
}));
jest.mock('@/providers/session-provider', () => ({
  useSession: jest.fn(),
  useIsAccount: jest.fn(),
  useUserEmail: jest.fn(),
}));

const leaveDeletedUser = jest.fn();

function given(isAccount: boolean) {
  jest.mocked(useIsAccount).mockReturnValue(isAccount);
  jest.mocked(useUserEmail).mockReturnValue(isAccount ? 'kaan@example.com' : undefined);
  const value = sessionValue('user-1', { isAnonymous: !isAccount });
  jest.mocked(useSession).mockReturnValue({ ...value, leaveDeletedUser });
}

/** What an Edge Function answers when it refuses, as supabase-js reports it. */
const refused = (error: string, status: number) => ({
  data: null,
  error: new FunctionsHttpError(new Response(JSON.stringify({ error }), { status })),
});

/** The functions' answers by name; anything else is done. */
function answering(answers: Record<string, ReturnType<typeof refused>> = {}) {
  jest
    .mocked(supabase.functions.invoke)
    .mockImplementation(
      (name: string) => Promise.resolve(answers[name] ?? { data: {}, error: null }) as never,
    );
}

beforeEach(() => {
  jest.clearAllMocks();
  given(true);
  answering();
  jest.mocked(supabase.auth.signInWithPassword).mockResolvedValue({ error: null } as never);
  jest.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: { access_token: 'previous token' } },
    error: null,
  } as never);
  jest.mocked(supabase.auth.admin.signOut).mockResolvedValue({ data: null, error: null });
  storedEmail('kaan@example.com');
});

/** The address Auth has for the account now, which may differ from the session's. */
function storedEmail(email: string) {
  jest.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: { email } },
    error: null,
  } as never);
}

/** Opens the sheet of an account and has the code sent. */
async function sendCode() {
  await render(<DeleteAccountScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
  expect(
    screen.getByText('To be sure it’s you, we’ll send a code to kaan@example.com.'),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
}

it('says what goes, with keeping the account as the main way out', async () => {
  await render(<DeleteAccountScreen />);

  expect(screen.getByRole('header')).toHaveTextContent('Delete your account?');
  expect(screen.getByText('Chats with Bite, photos and voice')).toBeOnTheScreen();
  expect(screen.getByText('The notes Bite kept, and your exercise photos')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Keep my account' }));

  expect(router.back).toHaveBeenCalled();
  expect(supabase.functions.invoke).not.toHaveBeenCalled();
});

describe('a guest', () => {
  beforeEach(() => given(false));

  it('is spoken to of data', async () => {
    await render(<DeleteAccountScreen />);

    expect(screen.getByRole('header')).toHaveTextContent('Delete your data?');
    expect(screen.getByRole('button', { name: 'Keep my data' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Delete my data' })).toBeOnTheScreen();
  });

  it('is asked once more before deleting, and starts over as a new guest', async () => {
    await render(<DeleteAccountScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Delete my data' }));
    expect(supabase.functions.invoke).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Delete for good' }));

    expect(supabase.functions.invoke).toHaveBeenCalledWith('delete-account', { body: undefined });
    await waitFor(() => expect(leaveDeletedUser).toHaveBeenCalled());
  });

  it('deletes nothing when the last question is declined', async () => {
    await render(<DeleteAccountScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Delete my data' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));

    expect(screen.queryByRole('button', { name: 'Delete for good' })).toBeNull();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('stays when deleting fails, and is told so', async () => {
    answering({ 'delete-account': refused('unavailable', 503) });
    await render(<DeleteAccountScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Delete my data' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Delete for good' }));

    expect(
      await screen.findByText('Something went wrong on our side. Try again in a moment.'),
    ).toBeOnTheScreen();
    expect(leaveDeletedUser).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Delete for good' })).toBeNull();
  });
});

describe('an account', () => {
  it('is sent a code, and deleted with it only once the button is pressed', async () => {
    await sendCode();

    expect(supabase.functions.invoke).toHaveBeenCalledWith('send-deletion-code', {
      body: { locale: 'en' },
    });
    expect(
      await screen.findByText(
        'We sent a 6-digit code to kaan@example.com. Enter it to delete your account.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('Nothing is deleted until you press the button.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Delete for good' })).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('6-digit code'), '481027');
    expect(supabase.functions.invoke).not.toHaveBeenCalledWith('delete-account', expect.anything());

    await fireEvent.press(screen.getByRole('button', { name: 'Delete for good' }));

    expect(supabase.functions.invoke).toHaveBeenCalledWith('delete-account', {
      body: { code: '481027' },
    });
    await waitFor(() => expect(leaveDeletedUser).toHaveBeenCalled());
  });

  it('is told a wrong code, which is typed anew, and nothing is deleted', async () => {
    answering({ 'delete-account': refused('wrong_code', 403) });
    await sendCode();
    await fireEvent.changeText(await screen.findByLabelText('6-digit code'), '000000');

    await fireEvent.press(screen.getByRole('button', { name: 'Delete for good' }));

    expect(
      await screen.findByText(
        'That code isn’t right, or it has expired. Try again, or send a new one.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('6-digit code')).toHaveProp('value', '');
    expect(screen.getByRole('button', { name: 'Delete for good' })).toBeDisabled();
    expect(leaveDeletedUser).not.toHaveBeenCalled();
  });

  it('goes on to the code when one was sent a moment ago', async () => {
    answering({ 'send-deletion-code': refused('too_soon', 429) });
    await sendCode();

    expect(await screen.findByLabelText('6-digit code')).toBeOnTheScreen();
  });

  it('stays when the code cannot be sent, and is told why', async () => {
    jest.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: new FunctionsFetchError(new Error('offline')),
    } as never);
    await sendCode();

    expect(
      await screen.findByText('No connection. Check your internet and try again.'),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText('6-digit code')).toBeNull();
  });

  it('can use the password instead, and is told when it is wrong', async () => {
    jest.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      error: new AuthApiError('wrong', 400, 'invalid_credentials'),
    } as never);
    await sendCode();
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Can’t open your email? Use your password' }),
    );
    expect(screen.getByRole('header')).toHaveTextContent('Confirm with your password');

    await fireEvent.changeText(screen.getByLabelText('Password'), 'guess');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete for good' }));

    expect(await screen.findByText('That isn’t your password.')).toBeOnTheScreen();
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'kaan@example.com',
      password: 'guess',
    });
    expect(supabase.functions.invoke).not.toHaveBeenCalledWith('delete-account', expect.anything());
    expect(supabase.auth.admin.signOut).not.toHaveBeenCalled();
    expect(leaveDeletedUser).not.toHaveBeenCalled();
  });

  it('is deleted with the right password, signing in with it first', async () => {
    await sendCode();
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Can’t open your email? Use your password' }),
    );
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete for good' }));

    await waitFor(() => expect(leaveDeletedUser).toHaveBeenCalled());
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'kaan@example.com',
      password: 'secret',
    });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('delete-account', {
      body: { signedIn: true },
    });
    // The session the sign-in replaced is signed out on the server, as no device holds it (#532).
    expect(supabase.auth.admin.signOut).toHaveBeenCalledWith('previous token', 'local');
  });

  it('is deleted even when the session the sign-in replaced cannot be signed out', async () => {
    jest.mocked(supabase.auth.admin.signOut).mockRejectedValue(new Error('offline'));
    await sendCode();
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Can’t open your email? Use your password' }),
    );
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete for good' }));

    await waitFor(() => expect(leaveDeletedUser).toHaveBeenCalled());
  });

  it('signs in with the address Auth has now, not one the session still keeps', async () => {
    storedEmail('new@example.com');
    await sendCode();
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Can’t open your email? Use your password' }),
    );
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete for good' }));

    await waitFor(() => expect(leaveDeletedUser).toHaveBeenCalled());
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'secret',
    });
  });

  it('is asked to wait when Auth takes no more tries', async () => {
    jest.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      error: new AuthApiError('slow down', 429, 'over_request_rate_limit'),
    } as never);
    await sendCode();
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Can’t open your email? Use your password' }),
    );
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete for good' }));

    expect(
      await screen.findByText('Too many tries. Wait a moment and try again.'),
    ).toBeOnTheScreen();
    expect(leaveDeletedUser).not.toHaveBeenCalled();
  });

  it('is pointed to the code when the password changed lately', async () => {
    answering({ 'delete-account': refused('password_recently_changed', 403) });
    await sendCode();
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Can’t open your email? Use your password' }),
    );
    await fireEvent.changeText(screen.getByLabelText('Password'), 'new one');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete for good' }));

    expect(
      await screen.findByText(
        'Your password changed in the last day, so it can’t confirm this yet. Use a code from your email.',
      ),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Use a code from my email instead' }));
    expect(screen.getByLabelText('6-digit code')).toBeOnTheScreen();
  });

  it('keeps the code typed and the wait when coming back from the password', async () => {
    await sendCode();
    await fireEvent.changeText(await screen.findByLabelText('6-digit code'), '481');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Can’t open your email? Use your password' }),
    );
    expect(screen.queryByLabelText('6-digit code')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Use a code from my email instead' }));

    expect(screen.getByLabelText('6-digit code')).toHaveProp('value', '481');
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
  });
});
