import i18n from '@/i18n';
import { act, fireEvent, render, screen } from '@/test/render';

import { LanguageSection } from './language-section';
import { loadLanguageChoice, setLanguageChoice } from './preferences';

jest.mock('expo-sqlite/kv-store', () => {
  const items = new Map<string, string>();
  return {
    Storage: {
      getItemSync: (key: string) => items.get(key) ?? null,
      setItemSync: (key: string, value: string) => void items.set(key, value),
      removeItemSync: (key: string) => void items.delete(key),
    },
  };
});

afterEach(() => act(() => setLanguageChoice('system')));

describe('LanguageSection', () => {
  it('shows the language in use, and opens the choices', async () => {
    await render(<LanguageSection />);
    expect(screen.getByText('English')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /Language/ }));
    expect(screen.getByRole('radio', { name: /Phone’s language/ })).toBeChecked();
    expect(screen.getByText('English now')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Türkçe' })).not.toBeChecked();
  });

  it('keeps the language chosen, switches to it and closes the choices', async () => {
    await render(<LanguageSection />);
    await fireEvent.press(screen.getByRole('button', { name: /Language/ }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Deutsch' }));
    expect(loadLanguageChoice()).toBe('de');
    expect(i18n.language).toBe('de');
    expect(screen.queryByRole('radio', { name: 'Deutsch' })).not.toBeOnTheScreen();
    expect(screen.getByText('Deutsch')).toBeOnTheScreen();
  });

  it('shows a language chosen elsewhere', async () => {
    await render(<LanguageSection />);
    await act(() => setLanguageChoice('tr'));
    await fireEvent.press(screen.getByRole('button', { name: /Dil/ }));
    expect(screen.getByRole('radio', { name: 'Türkçe' })).toBeChecked();
  });
});
