import ChangePasswordRoute from '@/app/account/password';
import { useIsAccount } from '@/providers/session-provider';
import { render, screen } from '@/test/render';

const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href);
    return null;
  },
}));
jest.mock('@/providers/session-provider', () => ({
  useIsAccount: jest.fn(),
  useSession: jest.fn(() => ({ status: 'ready', session: { user: { id: 'user-1' } } })),
  useUserEmail: jest.fn(() => 'kaan@example.com'),
}));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }));

beforeEach(() => jest.clearAllMocks());

describe('ChangePasswordRoute', () => {
  it('sends anyone without an account back, as a guest has no password to change', async () => {
    jest.mocked(useIsAccount).mockReturnValue(false);
    await render(<ChangePasswordRoute />);
    expect(mockRedirect).toHaveBeenCalledWith('/');
    expect(screen.queryByLabelText('Current password')).not.toBeOnTheScreen();
  });

  it('opens for an account', async () => {
    jest.mocked(useIsAccount).mockReturnValue(true);
    await render(<ChangePasswordRoute />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Current password')).toBeOnTheScreen();
  });
});
