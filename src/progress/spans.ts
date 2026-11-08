// How the charts of the Progress tab split a range into bars (ADR 0047).
import { fromIsoDate, toIsoDate, weekStart } from '@/i18n/dates';
import type { ProgressRange } from '@/lib/ranges';

/** What one bar of a chart stands for. */
export type Span = 'day' | 'week' | 'month';

/** A bar for each day of a month, each week of 3 or 6 months, and each month of a year. */
export const SPAN_OF: Record<ProgressRange, Span> = {
  month: 'day',
  threeMonths: 'week',
  sixMonths: 'week',
  year: 'month',
};

/** The first day, YYYY-MM-DD, of the span a day is in: the day, its Monday or its month's first. */
export function spanStart(day: string, span: Span): string {
  switch (span) {
    case 'day':
      return day;
    case 'week':
      return toIsoDate(weekStart(fromIsoDate(day)));
    case 'month':
      return `${day.slice(0, 7)}-01`;
  }
}
