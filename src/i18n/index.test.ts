import { getLocales } from 'expo-localization';
import type { i18n as I18n } from 'i18next';
import { AppState, type AppStateStatus } from 'react-native';

import i18n, { SUPPORTED_LANGUAGES, deviceLanguage } from '@/i18n';

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

describe('a chosen language', () => {
  function loadI18n() {
    let module: typeof import('@/i18n') | undefined;
    jest.isolateModules(() => {
      module = jest.requireActual<typeof import('@/i18n')>('@/i18n');
    });
    return module!;
  }

  afterEach(() => {
    mockedGetLocales.mockReturnValue([{ languageCode: 'en' }]);
    jest.restoreAllMocks();
  });

  it('replaces the device language, and stays when the device language changes', async () => {
    let onChange: ((state: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      onChange = listener;
      return { remove: jest.fn() };
    });
    const { default: instance, chooseLanguage } = loadI18n();
    chooseLanguage('tr');
    await Promise.resolve();
    expect(instance.language).toBe('tr');

    mockedGetLocales.mockReturnValue([{ languageCode: 'de' }]);
    onChange!('active');
    await Promise.resolve();
    expect(instance.language).toBe('tr');

    chooseLanguage(null);
    await Promise.resolve();
    expect(instance.language).toBe('de');
  });
});

describe('plural forms', () => {
  it('chooses the form by the number it counts, also with a second number', () => {
    const en = i18n.getFixedT('en');
    const de = i18n.getFixedT('de');
    expect(en('session.setsDone', { done: 0, count: 1 })).toBe('0 of 1 set');
    expect(en('session.setsDone', { done: 1, count: 3 })).toBe('1 of 3 sets');
    expect(de('session.setsDone', { done: 1, count: 1 })).toBe('1 von 1 Satz');
    expect(en('session.busy.message', { minutes: 1, count: 2 })).toBe(
      'You started it 1 min ago and logged 2 sets. Only one workout can run at a time.',
    );
    expect(en('history.exercise.reps', { count: 1 })).toBe('1 rep');
    expect(en('workout.target.reps', { sets: 3, count: 1 })).toBe('3 × 1 rep');
  });
});
