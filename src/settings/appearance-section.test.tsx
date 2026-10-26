import { fireEvent, render, screen } from '@/test/render';

import { AppearanceSection } from './appearance-section';
import { loadThemeChoice, saveThemeChoice } from './preferences';

jest.mock('./preferences', () => ({ loadThemeChoice: jest.fn(), saveThemeChoice: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(loadThemeChoice).mockReturnValue('system');
});

describe('AppearanceSection', () => {
  it('shows the chosen theme and keeps a new one', async () => {
    await render(<AppearanceSection />);
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
    expect(saveThemeChoice).toHaveBeenCalledWith('dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });
});
