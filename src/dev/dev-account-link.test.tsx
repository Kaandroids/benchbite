import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import { useSignIn } from '@/account/account';
import { fireEvent, render, screen } from '@/test/render';

import { DevAccountLink } from './dev-account-link';

jest.mock('@/account/account', () => ({
  ...jest.requireActual('@/account/account'),
  useSignIn: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mutate = jest.fn();

function failWith(error: Error) {
  jest
    .mocked(useSignIn)
    .mockReturnValue({ mutate, isPending: false, isError: true, error } as never);
}
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
  it('signs in to the seeded account, leaving the rest to the session', async () => {
    await render(<DevAccountLink />);
    await fireEvent.press(screen.getByRole('button', { name: 'Use the dev account' }));
    expect(mutate).toHaveBeenCalledWith({
      email: 'dev@benchbite.local',
      password: 'benchbite-dev',
    });
  });

  it('says how to seed the account when it is not there', async () => {
    failWith(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'));
    await render(<DevAccountLink />);
    expect(screen.getByText(/db reset/)).toBeTruthy();
  });

  it('says the local Supabase cannot be reached rather than to reset it', async () => {
    failWith(new AuthRetryableFetchError('Network request failed', 0));
    await render(<DevAccountLink />);
    expect(screen.getByText(/cannot be reached/)).toBeTruthy();
    expect(screen.queryByText(/db reset/)).toBeNull();
  });

  it('shows a note beside the link', async () => {
    await render(<DevAccountLink note="This guest is signed out." />);
    expect(screen.getByText('This guest is signed out.')).toBeTruthy();
  });

  it('is not there against a hosted project', async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcdefgh.supabase.co';
    await render(<DevAccountLink />);
    expect(screen.queryByRole('button', { name: 'Use the dev account' })).toBeNull();
  });
});
