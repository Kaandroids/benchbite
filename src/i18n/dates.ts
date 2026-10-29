import { useTranslation } from 'react-i18next';

/** A date as the database stores days, YYYY-MM-DD, in the device's time zone. */
export function toIsoDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Today on the device, YYYY-MM-DD. Days follow the device (ADR 0034), so calls that depend on the
 * day send it to the database, which checks it against its own (ADR 0041).
 */
export function deviceToday(): string {
  return toIsoDate(new Date());
}

/** The ISO weekday of a date, 1 for Monday to 7 for Sunday. */
export function isoWeekday(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1;
}

/** A day as YYYY-MM-DD read as local midnight, the reverse of `toIsoDate`. */
export function fromIsoDate(date: string): Date {
  return new Date(`${date}T00:00`);
}

/** The ISO weekday of a day as YYYY-MM-DD. */
export function weekdayOf(date: string): number {
  return isoWeekday(fromIsoDate(date));
}

/** The day `days` after a date, at midnight. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** How many days `day` is before `today`, by the calendar; negative for a later day. */
export function daysBetween(day: Date, today: Date): number {
  const utc = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((utc(today) - utc(day)) / 86_400_000);
}

/** The Monday a week starts on, at midnight. */
export function weekStart(date: Date): Date {
  return addDays(date, 1 - isoWeekday(date));
}

/** How many months `to` is after `from`, by the calendar, whatever their days. */
export function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
}

/** The weeks of the month of `month`, from Monday, each day of the months beside it as null. */
export function monthWeeks(month: Date): (Date | null)[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const weeks: (Date | null)[][] = [];
  for (let monday = weekStart(first); monday <= end; monday = addDays(monday, 7)) {
    weeks.push(
      [0, 1, 2, 3, 4, 5, 6].map((offset) => {
        const day = addDays(monday, offset);
        return day.getMonth() === month.getMonth() ? day : null;
      }),
    );
  }
  return weeks;
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

/** Formats a day of this year with its weekday, for example "Friday, October 23". */
export function useDayFormat() {
  const { i18n } = useTranslation();
  const formatter = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  return (date: Date) => formatter.format(date);
}

/** Formats a day of this year without its weekday, for example "October 23". */
export function useMonthDayFormat() {
  const { i18n } = useTranslation();
  const formatter = new Intl.DateTimeFormat(i18n.language, { month: 'long', day: 'numeric' });
  return (date: Date) => formatter.format(date);
}

/** Formats a month by its short name, for example "Oct". */
export function useMonthFormat() {
  const { i18n } = useTranslation();
  const formatter = new Intl.DateTimeFormat(i18n.language, { month: 'short' });
  return (date: Date) => formatter.format(date);
}

/**
 * Formats a month with its year, for example "October 2026"; with `today`, the year only when it is
 * not today's, for example "October" and "September 2025".
 */
export function useMonthYearFormat(today?: Date) {
  const { i18n } = useTranslation();
  const withYear = new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' });
  const withoutYear = new Intl.DateTimeFormat(i18n.language, { month: 'long' });
  return (date: Date) =>
    (today && date.getFullYear() === today.getFullYear() ? withoutYear : withYear).format(date);
}

/** Formats a week by its first and last day, for example "October 19 – 25". */
export function useWeekRangeFormat() {
  const { i18n } = useTranslation();
  const formatter = new Intl.DateTimeFormat(i18n.language, { month: 'long', day: 'numeric' });
  return (start: Date) => {
    const end = addDays(start, 6);
    return formatter.formatRange
      ? formatter.formatRange(start, end)
      : `${formatter.format(start)} – ${formatter.format(end)}`;
  };
}

/** Formats a day briefly with its weekday, for example "Tue, Oct 27". */
export function useWeekdayDateFormat() {
  const { i18n } = useTranslation();
  const formatter = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return (date: Date) => formatter.format(date);
}

/** Formats the time of day of a moment, such as 18:30 or 6:30 PM, as the app language writes it. */
export function useClockFormat() {
  const { i18n } = useTranslation();
  const formatter = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });
  return (moment: Date | number) => formatter.format(moment);
}

/** Formats a time of day, given in minutes after midnight, as the app language writes it. */
export function useTimeFormat() {
  const { i18n } = useTranslation();
  const formatter = new Intl.DateTimeFormat(i18n.language, { hour: 'numeric', minute: '2-digit' });
  return (minutes: number) =>
    formatter.format(new Date(2024, 0, 1, Math.floor(minutes / 60), minutes % 60));
}

/**
 * Formats a day in a few characters in the app language, such as "Oct 23", with the year when it
 * is not the year of `today`, such as "Oct 23, 2025".
 */
export function useShortDateFormat(today: Date) {
  const { i18n } = useTranslation();
  const thisYear = new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' });
  const otherYear = new Intl.DateTimeFormat(i18n.language, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return (date: Date) =>
    (date.getFullYear() === today.getFullYear() ? thisYear : otherYear).format(date);
}
