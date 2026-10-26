import { useDisplayName, useSetDisplayName } from '@/profile/display-name';
import { fireEvent, render, screen } from '@/test/render';

import { ProfileSection } from './profile-section';

jest.mock('@/profile/display-name', () => ({
  ...jest.requireActual<object>('@/profile/display-name'),
  useDisplayName: jest.fn(),
  useSetDisplayName: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mutate = jest.fn();

function mockName(name: string | null, saving = { isPending: false, isError: false }) {
  jest.mocked(useDisplayName).mockReturnValue({ data: name } as never);
  jest.mocked(useSetDisplayName).mockReturnValue({ mutate, ...saving } as never);
}

async function openSheet() {
  await fireEvent.press(screen.getByRole('button', { name: /^Name/ }));
}

describe('ProfileSection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the name and saves a new one', async () => {
    mockName('Kaan');
    await render(<ProfileSection />);
    expect(screen.getByText('Kaan')).toBeTruthy();
    await openSheet();
    await fireEvent.changeText(screen.getByLabelText('Name'), ' Kaan K ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(mutate).toHaveBeenCalledWith('Kaan K', expect.anything());
  });

  it('removes the name when the field is emptied', async () => {
    mockName('Kaan');
    await render(<ProfileSection />);
    await openSheet();
    await fireEvent.changeText(screen.getByLabelText('Name'), '  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(mutate).toHaveBeenCalledWith(null, expect.anything());
  });

  it('closes without saving an unchanged name', async () => {
    mockName(null);
    await render(<ProfileSection />);
    await openSheet();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('does not remove a name that loaded after the sheet opened', async () => {
    jest.mocked(useDisplayName).mockReturnValue({ data: undefined } as never);
    jest
      .mocked(useSetDisplayName)
      .mockReturnValue({ mutate, isPending: false, isError: false } as never);
    await render(<ProfileSection />);
    await openSheet();
    mockName('Kaan');
    await screen.rerender(<ProfileSection />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(mutate).not.toHaveBeenCalled();
  });

  it('says when the name could not be saved', async () => {
    mockName('Kaan', { isPending: false, isError: true });
    await render(<ProfileSection />);
    await openSheet();
    expect(screen.getByText('Couldn’t save the name. Try again.')).toBeTruthy();
  });
});
