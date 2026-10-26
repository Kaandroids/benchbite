import { fireEvent, render, screen } from '@/test/render';

import { LanguageSection } from './language-section';
import { loadLanguageChoice, saveLanguageChoice } from './preferences';

jest.mock('./preferences', () => ({
  loadLanguageChoice: jest.fn(),
  saveLanguageChoice: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(loadLanguageChoice).mockReturnValue('system');
});

describe('LanguageSection', () => {
  it('shows the language in use, and opens the choices', async () => {
    await render(<LanguageSection />);
    expect(screen.getByText('English')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /Language/ }));
    expect(screen.getByRole('radio', { name: /Phone’s language/ })).toBeChecked();
    expect(screen.getByText('English now')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Türkçe' })).not.toBeChecked();
  });

  it('keeps the language chosen and closes the choices', async () => {
    await render(<LanguageSection />);
    await fireEvent.press(screen.getByRole('button', { name: /Language/ }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Deutsch' }));
    expect(saveLanguageChoice).toHaveBeenCalledWith('de');
    expect(screen.queryByRole('radio', { name: 'Deutsch' })).not.toBeOnTheScreen();
  });
});
