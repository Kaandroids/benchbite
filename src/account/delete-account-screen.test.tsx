import { router } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { useIsAccount, useSession } from '@/providers/session-provider';
import { sessionValue } from '@/test/context-mocks';
import { fireEvent, render, screen, waitFor } from '@/test/render';

import { DeleteAccountScreen } from './delete-account-screen';

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
jest.mock('@/providers/session-provider', () => ({
  useSession: jest.fn(),
  useIsAccount: jest.fn(),
}));

const leaveDeletedUser = jest.fn();

function given(isAccount: boolean) {
  jest.mocked(useIsAccount).mockReturnValue(isAccount);
  const value = sessionValue('user-1', { isAnonymous: !isAccount });
  jest.mocked(useSession).mockReturnValue({ ...value, leaveDeletedUser });
}

beforeEach(() => {
  jest.clearAllMocks();
  given(true);
  jest.mocked(supabase.functions.invoke).mockResolvedValue({ data: {}, error: null } as never);
});

it('says what goes, with keeping the account as the main way out', async () => {
  await render(<DeleteAccountScreen />);

  expect(screen.getByRole('header')).toHaveTextContent('Delete your account?');
  expect(screen.getByText('Chats with Bite, photos and voice')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Keep my account' }));

  expect(router.back).toHaveBeenCalled();
  expect(supabase.functions.invoke).not.toHaveBeenCalled();
});

it('speaks of data to a guest', async () => {
  given(false);
  await render(<DeleteAccountScreen />);

  expect(screen.getByRole('header')).toHaveTextContent('Delete your data?');
  expect(screen.getByRole('button', { name: 'Keep my data' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Delete my data' })).toBeOnTheScreen();
});

it('asks once more before deleting, and starts over as a new guest', async () => {
  await render(<DeleteAccountScreen />);

  await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
  expect(supabase.functions.invoke).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('button', { name: 'Delete for good' }));

  expect(supabase.functions.invoke).toHaveBeenCalledWith('delete-account');
  await waitFor(() => expect(leaveDeletedUser).toHaveBeenCalled());
});

it('deletes nothing when the last question is declined', async () => {
  await render(<DeleteAccountScreen />);

  await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));

  expect(screen.queryByRole('button', { name: 'Delete for good' })).toBeNull();
  expect(supabase.functions.invoke).not.toHaveBeenCalled();
});

it('stays when deleting fails, and says so', async () => {
  jest
    .mocked(supabase.functions.invoke)
    .mockResolvedValue({ data: null, error: new Error('unavailable') } as never);
  await render(<DeleteAccountScreen />);

  await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Delete for good' }));

  expect(
    await screen.findByText('We couldn’t delete it. Check your connection and try again.'),
  ).toBeOnTheScreen();
  expect(leaveDeletedUser).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Delete for good' })).toBeNull();
});
