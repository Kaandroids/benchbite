import { Appearance } from 'react-native';

import { fireEvent, render, screen } from '@/test/render';

import { AppearanceSection } from './appearance-section';
import { loadThemeChoice } from './preferences';

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

beforeEach(() => {
  jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
});

describe('AppearanceSection', () => {
  it('shows the chosen theme, and keeps and applies a new one', async () => {
    await render(<AppearanceSection />);
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(loadThemeChoice()).toBe('dark');
    expect(Appearance.setColorScheme).toHaveBeenCalledWith('dark');
  });
});
