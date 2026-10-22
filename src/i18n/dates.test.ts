import i18n from '@/i18n';
import { act, renderHook } from '@/test/render';

import { isoWeekday, useDateFormat, useTimeFormat, useWeekdayFormat } from './dates';

describe('isoWeekday', () => {
  it('numbers the days from Monday (1) to Sunday (7)', () => {
    // 5 October 2026 is a Monday.
    const expected = [1, 2, 3, 4, 5, 6, 7];
    expected.forEach((weekday, offset) => {
      expect(isoWeekday(new Date(2026, 9, 5 + offset))).toBe(weekday);
    });
  });

  it('gives Sunday 7 rather than 0', () => {
    expect(isoWeekday(new Date(2026, 9, 11))).toBe(7);
  });

  it('ignores the time of day', () => {
    expect(isoWeekday(new Date(2026, 9, 11, 0, 0))).toBe(7);
    expect(isoWeekday(new Date(2026, 9, 11, 23, 59))).toBe(7);
  });
});

describe('useWeekdayFormat', () => {
  afterEach(async () => {
    await act(() => i18n.changeLanguage('en'));
  });

  it('names the weekdays in full by default', async () => {
    await act(() => i18n.changeLanguage('en'));
    const { result } = await renderHook(() => useWeekdayFormat());
    expect([1, 2, 3, 4, 5, 6, 7].map(result.current)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
  });

  it('abbreviates the weekdays when asked to', async () => {
    await act(() => i18n.changeLanguage('en'));
    const { result } = await renderHook(() => useWeekdayFormat('short'));
    expect(result.current(1)).toBe('Mon');
    expect(result.current(7)).toBe('Sun');
  });

  it('names the weekdays in the app language', async () => {
    await act(() => i18n.changeLanguage('de'));
    const { result: german } = await renderHook(() => useWeekdayFormat());
    expect(german.current(1)).toBe('Montag');
    expect(german.current(7)).toBe('Sonntag');

    await act(() => i18n.changeLanguage('tr'));
    const { result: turkish } = await renderHook(() => useWeekdayFormat());
    expect(turkish.current(1)).toBe('Pazartesi');
    expect(turkish.current(7)).toBe('Pazar');
  });
});

describe('useTimeFormat', () => {
  afterEach(async () => {
    await act(() => i18n.changeLanguage('en'));
  });

  it('uses the twelve-hour clock in English', async () => {
    await act(() => i18n.changeLanguage('en'));
    const { result } = await renderHook(() => useTimeFormat());
    // The space before AM and PM may be a narrow no-break space.
    expect(result.current(18 * 60)).toMatch(/^6:00\sPM$/);
    expect(result.current(0)).toMatch(/^12:00\sAM$/);
    expect(result.current(23 * 60 + 45)).toMatch(/^11:45\sPM$/);
  });

  it.each(['de', 'tr'])('uses the 24-hour clock in %s', async (language) => {
    await act(() => i18n.changeLanguage(language));
    const { result } = await renderHook(() => useTimeFormat());
    expect(result.current(18 * 60)).toBe('18:00');
    expect(result.current(0)).toBe('0:00');
    expect(result.current(23 * 60 + 45)).toBe('23:45');
    expect(result.current(7 * 60 + 5)).toBe('7:05');
  });
});

describe('useDateFormat', () => {
  afterEach(async () => {
    await act(() => i18n.changeLanguage('en'));
  });

  it.each([
    ['en', 'full', 'Wednesday, October 21, 2026'],
    ['en', 'long', 'October 21, 2026'],
    ['en', 'medium', 'Oct 21, 2026'],
    ['en', 'short', '10/21/26'],
    ['de', 'full', 'Mittwoch, 21. Oktober 2026'],
    ['de', 'long', '21. Oktober 2026'],
    ['de', 'medium', '21.10.2026'],
    ['de', 'short', '21.10.26'],
    ['tr', 'full', '21 Ekim 2026 Çarşamba'],
    ['tr', 'long', '21 Ekim 2026'],
    ['tr', 'medium', '21 Eki 2026'],
    ['tr', 'short', '21.10.2026'],
  ] as const)('formats dates in %s with the %s style', async (language, style, expected) => {
    await act(() => i18n.changeLanguage(language));
    const { result } = await renderHook(() => useDateFormat(style));
    expect(result.current(new Date(2026, 9, 21))).toBe(expected);
  });
});
