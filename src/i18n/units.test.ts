import { getLocales } from 'expo-localization';

import i18n from '@/i18n';
import { renderHook } from '@/test/render';

import {
  defaultUnits,
  feetAndInchesToCm,
  heightToFeetAndInches,
  paceIn,
  paceToKg,
  useNumberFormat,
  useWeightFormat,
  weightIn,
  weightToKg,
} from './units';

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en', measurementSystem: 'metric' }]),
}));

const mockedGetLocales = getLocales as jest.Mock;

describe('defaultUnits', () => {
  afterEach(() => {
    mockedGetLocales.mockReturnValue([{ languageCode: 'en', measurementSystem: 'metric' }]);
  });

  it('uses pounds and feet in the United States', () => {
    mockedGetLocales.mockReturnValue([{ measurementSystem: 'us' }]);
    expect(defaultUnits()).toEqual({ weight: 'lb', height: 'ft' });
  });

  it('uses kilograms and feet in the United Kingdom', () => {
    mockedGetLocales.mockReturnValue([{ measurementSystem: 'uk' }]);
    expect(defaultUnits()).toEqual({ weight: 'kg', height: 'ft' });
  });

  it('uses metric units elsewhere', () => {
    mockedGetLocales.mockReturnValue([{ measurementSystem: 'metric' }]);
    expect(defaultUnits()).toEqual({ weight: 'kg', height: 'cm' });
  });

  it('follows the first preferred locale only', () => {
    mockedGetLocales.mockReturnValue([
      { measurementSystem: 'metric' },
      { measurementSystem: 'us' },
    ]);
    expect(defaultUnits()).toEqual({ weight: 'kg', height: 'cm' });
  });

  it('falls back to metric units without a locale or measurement system', () => {
    mockedGetLocales.mockReturnValue([]);
    expect(defaultUnits()).toEqual({ weight: 'kg', height: 'cm' });
    mockedGetLocales.mockReturnValue([{ measurementSystem: null }]);
    expect(defaultUnits()).toEqual({ weight: 'kg', height: 'cm' });
  });
});

describe('weight conversions', () => {
  it('shows kilograms with one decimal', () => {
    expect(weightIn('kg', 72.46)).toBe(72.5);
    expect(weightIn('kg', 72.44)).toBe(72.4);
    expect(weightIn('kg', 80)).toBe(80);
  });

  it('shows pounds with one decimal', () => {
    // 100 / 0.45359237 = 220.462…
    expect(weightIn('lb', 100)).toBe(220.5);
    // 72.5 / 0.45359237 = 159.836…
    expect(weightIn('lb', 72.5)).toBe(159.8);
  });

  it('stores kilograms with one decimal', () => {
    expect(weightToKg('kg', 80.04)).toBe(80);
    expect(weightToKg('kg', 80.06)).toBe(80.1);
  });

  it('converts pounds to kilograms with two decimals', () => {
    // 160 × 0.45359237 = 72.574…
    expect(weightToKg('lb', 160)).toBe(72.57);
    // 220.5 × 0.45359237 = 100.017…
    expect(weightToKg('lb', 220.5)).toBe(100.02);
  });

  // Regression: kilograms rounded to a tenth turned 150.2 lb back into 150.1 lb, so the tenths
  // wheel jumped back and some values could not be chosen.
  it('keeps every tenth of a pound that is chosen', () => {
    for (let tenths = 670; tenths <= 6610; tenths++) {
      const lb = tenths / 10;
      expect(weightIn('lb', weightToKg('lb', lb))).toBe(lb);
    }
  });

  it('turns a weight shown in pounds back into nearly the same kilograms', () => {
    for (const kg of [30, 55.5, 72.5, 80.1, 120, 300]) {
      expect(weightToKg('lb', weightIn('lb', kg))).toBeCloseTo(kg, 1);
    }
  });
});

describe('pace conversions', () => {
  it('rounds paces to two decimals', () => {
    expect(paceIn('kg', 0.456)).toBe(0.46);
    expect(paceToKg('kg', 0.254)).toBe(0.25);
  });

  it('converts paces between kilograms and pounds', () => {
    // 0.45 / 0.45359237 = 0.992…
    expect(paceIn('lb', 0.45)).toBe(0.99);
    // 0.9 / 0.45359237 = 1.984…
    expect(paceIn('lb', 0.9)).toBe(1.98);
    // 2 × 0.45359237 = 0.907…
    expect(paceToKg('lb', 2)).toBe(0.91);
    expect(paceToKg('lb', 1)).toBe(0.45);
  });
});

describe('height conversions', () => {
  it('splits centimetres into whole feet and inches', () => {
    // 180 / 2.54 = 70.87 inches, rounded to 71.
    expect(heightToFeetAndInches(180)).toEqual({ feet: 5, inches: 11 });
    expect(heightToFeetAndInches(175)).toEqual({ feet: 5, inches: 9 });
    expect(heightToFeetAndInches(152.4)).toEqual({ feet: 5, inches: 0 });
  });

  it('carries twelve rounded inches over to the next foot', () => {
    // 182 / 2.54 = 71.65 inches, rounded to 72.
    expect(heightToFeetAndInches(182)).toEqual({ feet: 6, inches: 0 });
  });

  it('converts feet and inches to centimetres with one decimal', () => {
    // 71 × 2.54 = 180.34
    expect(feetAndInchesToCm(5, 11)).toBe(180.3);
    // 72 × 2.54 = 182.88
    expect(feetAndInchesToCm(6, 0)).toBe(182.9);
    expect(feetAndInchesToCm(0, 0)).toBe(0);
  });

  it('round-trips feet and inches through centimetres', () => {
    for (let feet = 3; feet <= 8; feet++) {
      for (let inches = 0; inches < 12; inches++) {
        expect(heightToFeetAndInches(feetAndInchesToCm(feet, inches))).toEqual({ feet, inches });
      }
    }
  });
});

describe('useNumberFormat', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('formats numbers the English way', async () => {
    await i18n.changeLanguage('en');
    const { result } = await renderHook(() => useNumberFormat());
    expect(result.current.format(72.5)).toBe('72.5');
    expect(result.current.format(1234.5)).toBe('1,234.5');
    expect(result.current.decimalSeparator).toBe('.');
  });

  it.each(['de', 'tr'])('formats numbers with a decimal comma in %s', async (language) => {
    await i18n.changeLanguage(language);
    const { result } = await renderHook(() => useNumberFormat());
    expect(result.current.format(72.5)).toBe('72,5');
    expect(result.current.format(1234.5)).toBe('1.234,5');
    expect(result.current.decimalSeparator).toBe(',');
  });

  it('passes the options on to the formatter', async () => {
    await i18n.changeLanguage('de');
    const { result } = await renderHook(() => useNumberFormat());
    expect(result.current.format(80, { minimumFractionDigits: 1 })).toBe('80,0');
  });
});

describe('useWeightFormat', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('formats a weight in the unit with at most one decimal', async () => {
    const { result } = await renderHook(() => useWeightFormat());
    expect(result.current(72.5, 'kg')).toBe('72.5');
    expect(result.current(80, 'kg')).toBe('80');
    // 72.5 / 0.45359237 = 159.836…
    expect(result.current(72.5, 'lb')).toBe('159.8');
  });

  it('follows the app language', async () => {
    await i18n.changeLanguage('de');
    const { result } = await renderHook(() => useWeightFormat());
    expect(result.current(72.5, 'kg')).toBe('72,5');
  });
});
