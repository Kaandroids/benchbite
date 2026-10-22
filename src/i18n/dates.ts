import { useTranslation } from 'react-i18next';

/** A date as the database stores days, YYYY-MM-DD, in the device's time zone. */
export function toIsoDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The ISO weekday of a date, 1 for Monday to 7 for Sunday. */
export function isoWeekday(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1;
}

/**
 * Names ISO weekdays in the app language, for example "Monday" or "Mon". Like numbers, they
 * follow the app language rather than the device region.
 */
export function useWeekdayFormat(width: 'long' | 'short' | 'narrow' = 'long') {
  const { i18n } = useTranslation();
  const formatter = new Intl.DateTimeFormat(i18n.language, { weekday: width });
  // 1 January 2024 was a Monday, so day n of that month is ISO weekday n.
  return (weekday: number) => formatter.format(new Date(2024, 0, weekday));
}

/**
 * Formats dates in the app language and one of Intl's styles, from full ("Wednesday, October 21,
 * 2026") to short ("10/21/26").
 */
export function useDateFormat(style: NonNullable<Intl.DateTimeFormatOptions['dateStyle']>) {
  const { i18n } = useTranslation();
  const formatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: style });
  return (date: Date) => formatter.format(date);
}

/** Formats a time of day, given in minutes after midnight, as the app language writes it. */
export function useTimeFormat() {
  const { i18n } = useTranslation();
  const formatter = new Intl.DateTimeFormat(i18n.language, { hour: 'numeric', minute: '2-digit' });
  return (minutes: number) =>
    formatter.format(new Date(2024, 0, 1, Math.floor(minutes / 60), minutes % 60));
}
