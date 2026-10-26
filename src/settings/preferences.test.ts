import { Appearance } from 'react-native';

import { chooseLanguage } from '@/i18n';

import {
  applyStoredPreferences,
  loadLanguageChoice,
  loadThemeChoice,
  saveLanguageChoice,
  saveThemeChoice,
} from './preferences';

jest.mock('expo-sqlite/kv-store', () => {
  const items = new Map<string, string>();
  return {
    Storage: {
      getItemSync: (key: string) => items.get(key) ?? null,
      setItemSync: (key: string, value: string) => void items.set(key, value),
      removeItemSync: (key: string) => void items.delete(key),
      clearSync: () => items.clear(),
    },
  };
});
jest.mock('@/i18n', () => ({ SUPPORTED_LANGUAGES: ['en', 'de', 'tr'], chooseLanguage: jest.fn() }));

const { Storage } = jest.requireMock<{ Storage: { clearSync: () => void } }>(
  'expo-sqlite/kv-store',
);

beforeEach(() => {
  jest.clearAllMocks();
  Storage.clearSync();
  jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
});

describe('the theme', () => {
  it('follows the system until another one is chosen', () => {
    expect(loadThemeChoice()).toBe('system');
    saveThemeChoice('dark');
    expect(loadThemeChoice()).toBe('dark');
    expect(Appearance.setColorScheme).toHaveBeenLastCalledWith('dark');
  });

  it('follows the system again when it is chosen', () => {
    saveThemeChoice('light');
    saveThemeChoice('system');
    expect(loadThemeChoice()).toBe('system');
    expect(Appearance.setColorScheme).toHaveBeenLastCalledWith('unspecified');
  });
});

describe('the language', () => {
  it('follows the device until another one is chosen', () => {
    expect(loadLanguageChoice()).toBe('system');
    saveLanguageChoice('tr');
    expect(loadLanguageChoice()).toBe('tr');
    expect(chooseLanguage).toHaveBeenLastCalledWith('tr');
    saveLanguageChoice('system');
    expect(loadLanguageChoice()).toBe('system');
    expect(chooseLanguage).toHaveBeenLastCalledWith(null);
  });
});

describe('applyStoredPreferences', () => {
  it('applies what was chosen before', () => {
    saveThemeChoice('dark');
    saveLanguageChoice('de');
    jest.clearAllMocks();
    applyStoredPreferences();
    expect(Appearance.setColorScheme).toHaveBeenCalledWith('dark');
    expect(chooseLanguage).toHaveBeenCalledWith('de');
  });

  it('leaves the device settings alone when nothing was chosen', () => {
    applyStoredPreferences();
    expect(Appearance.setColorScheme).not.toHaveBeenCalled();
    expect(chooseLanguage).not.toHaveBeenCalled();
  });
});
