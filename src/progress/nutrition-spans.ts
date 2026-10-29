import { fromIsoDate, toIsoDate, weekStart } from '@/i18n/dates';
import {
  nutritionSummary,
  type DayNutrition,
  type NutritionSummary,
} from '@/nutrition/day-nutrition';

import type { ProgressRange } from '@/lib/ranges';

/** What one bar of the eating chart stands for. */
export type Span = 'day' | 'week' | 'month';

/** A bar for each day of a month, each week of 3 or 6 months, and each month of a year. */
export const SPAN_OF: Record<ProgressRange, Span> = {
  month: 'day',
  threeMonths: 'week',
  sixMonths: 'week',
  year: 'month',
};

export type NutritionSpan = {
  /** Its first day, YYYY-MM-DD: the day, the Monday or the first of the month. */
  start: string;
  /** Its days logged summed up; null when none was. */
  summary: NutritionSummary | null;
  /** Whether an average day of it went over the average target of its days. */
  over: boolean;
};

function startOf(day: string, span: Span): string {
  switch (span) {
    case 'day':
      return day;
    case 'week':
      return toIsoDate(weekStart(fromIsoDate(day)));
    case 'month':
      return `${day.slice(0, 7)}-01`;
  }
}

/** The calories of an average day's target, over the days logged that have targets. */
export function averageTarget(days: readonly DayNutrition[]): number | null {
  const targets = days.flatMap((day) =>
    day.entries > 0 && day.targets ? [day.targets.calories] : [],
  );
  return targets.length > 0
    ? targets.reduce((sum, calories) => sum + calories, 0) / targets.length
    : null;
}

/** The days, from the first, grouped into spans of `span`, each summed up over its days logged. */
export function nutritionSpans(days: readonly DayNutrition[], span: Span): NutritionSpan[] {
  const groups = new Map<string, DayNutrition[]>();
  for (const day of days) {
    const start = startOf(day.day, span);
    groups.set(start, [...(groups.get(start) ?? []), day]);
  }
  return [...groups].map(([start, spanDays]) => {
    const summary = nutritionSummary(spanDays);
    const target = averageTarget(spanDays);
    return {
      start,
      summary,
      over: summary !== null && target !== null && summary.average.calories > target,
    };
  });
}
