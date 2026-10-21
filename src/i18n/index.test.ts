import { getLocales } from 'expo-localization';
import type { i18n as I18n } from 'i18next';
import { AppState, type AppStateStatus } from 'react-native';

import { SUPPORTED_LANGUAGES, deviceLanguage } from '@/i18n';

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en' }]),
}));

const mockedGetLocales = getLocales as jest.Mock;

describe('deviceLanguage', () => {
  afterEach(() => {
    mockedGetLocales.mockReturnValue([{ languageCode: 'en' }]);
  });

  it('supports English, German and Turkish', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en', 'de', 'tr']);
  });

  it.each(['en', 'de', 'tr'])('uses %s when it is the preferred language', (language) => {
    mockedGetLocales.mockReturnValue([{ languageCode: language }]);
    expect(deviceLanguage()).toBe(language);
  });

  it('picks the first preferred language that is supported', () => {
    mockedGetLocales.mockReturnValue([
      { languageCode: 'fr' },
      { languageCode: 'tr' },
      { languageCode: 'de' },
    ]);
    expect(deviceLanguage()).toBe('tr');
  });

  it('falls back to English when no preferred language is supported', () => {
    mockedGetLocales.mockReturnValue([{ languageCode: 'fr' }, { languageCode: 'es' }]);
    expect(deviceLanguage()).toBe('en');
  });

  it('falls back to English without preferred languages', () => {
    mockedGetLocales.mockReturnValue([]);
    expect(deviceLanguage()).toBe('en');
    mockedGetLocales.mockReturnValue([{ languageCode: null }]);
    expect(deviceLanguage()).toBe('en');
  });

  it('matches the language code exactly', () => {
    mockedGetLocales.mockReturnValue([{ languageCode: 'DE' }, { languageCode: 'de-AT' }]);
    expect(deviceLanguage()).toBe('en');
  });
});

describe('the app language', () => {
  // A fresh instance, so that it reads the device language mocked for the test.
  function loadI18n(): I18n {
    let instance: I18n | undefined;
    jest.isolateModules(() => {
      instance = jest.requireActual<{ default: I18n }>('@/i18n').default;
    });
    return instance!;
  }

  afterEach(() => {
    mockedGetLocales.mockReturnValue([{ languageCode: 'en' }]);
    jest.restoreAllMocks();
  });

  it('starts in the device language', () => {
    mockedGetLocales.mockReturnValue([{ languageCode: 'de' }]);
    expect(loadI18n().language).toBe('de');
  });

  it('follows the device language when the app becomes active again', async () => {
    let onChange: ((state: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      onChange = listener;
      return { remove: jest.fn() };
    });
    const instance = loadI18n();
    expect(instance.language).toBe('en');

    mockedGetLocales.mockReturnValue([{ languageCode: 'tr' }]);
    onChange!('background');
    expect(instance.language).toBe('en');
    onChange!('active');
    await Promise.resolve();
    expect(instance.language).toBe('tr');
  });
});
