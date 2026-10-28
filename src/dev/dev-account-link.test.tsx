import { router } from 'expo-router';

import { useSignIn } from '@/account/account';
import { fireEvent, render, screen } from '@/test/render';

import { DevAccountLink } from './dev-account-link';

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('@/account/account', () => ({ useSignIn: jest.fn() }));

const mutate = jest.fn();
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useSignIn).mockReturnValue({ mutate, isPending: false, isError: false } as never);
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
});
afterAll(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = URL;
});

describe('DevAccountLink', () => {
  it('signs in to the seeded account and opens the app', async () => {
    await render(<DevAccountLink />);
    await fireEvent.press(screen.getByRole('button', { name: 'Use the dev account' }));
    expect(mutate).toHaveBeenCalledWith(
      { email: 'dev@benchbite.local', password: 'benchbite-dev' },
      expect.anything(),
    );
    mutate.mock.calls[0][1].onSuccess();
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('says how to seed the account when it is not there', async () => {
    jest.mocked(useSignIn).mockReturnValue({ mutate, isPending: false, isError: true } as never);
    await render(<DevAccountLink />);
    expect(screen.getByText(/db reset/)).toBeTruthy();
  });

  it('is not there against a hosted project', async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcdefgh.supabase.co';
    await render(<DevAccountLink />);
    expect(screen.queryByRole('button', { name: 'Use the dev account' })).toBeNull();
  });
});
