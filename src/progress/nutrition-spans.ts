import {
  nutritionSummary,
  type DayNutrition,
  type NutritionSummary,
} from '@/nutrition/day-nutrition';

import { spanStart, type Span } from './spans';

export type NutritionSpan = {
  /** Its first day, YYYY-MM-DD: the day, the Monday or the first of the month. */
  start: string;
  /** Its days logged summed up; null when none was. */
  summary: NutritionSummary | null;
  /** Whether an average day of it went over the average target of its days. */
  over: boolean;
};

/** The days, from the first, grouped into spans of `span`, each summed up over its days logged. */
export function nutritionSpans(days: readonly DayNutrition[], span: Span): NutritionSpan[] {
  const groups = new Map<string, DayNutrition[]>();
  for (const day of days) {
    const start = spanStart(day.day, span);
    groups.set(start, [...(groups.get(start) ?? []), day]);
  }
  return [...groups].map(([start, spanDays]) => {
    const summary = nutritionSummary(spanDays);
    const target = summary?.averageTargets;
    return {
      start,
      summary,
      over: !!summary && !!target && summary.average.calories > target.calories,
    };
  });
}
