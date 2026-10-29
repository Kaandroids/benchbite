import type { DayNutrition } from '@/nutrition/day-nutrition';

import { nutritionSpans } from './nutrition-spans';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const TARGETS = { calories: 2000, proteinG: 150, carbsG: 200, fatG: 60 };

const day = (date: string, calories: number, targets: DayNutrition['targets'] = TARGETS) => ({
  day: date,
  eaten: { calories, proteinG: 100, carbsG: 200, fatG: 50 },
  entries: calories > 0 ? 1 : 0,
  targets,
  keptTarget: false,
});

describe('nutritionSpans', () => {
  it('gives each day its own bar', () => {
    const spans = nutritionSpans([day('2026-10-27', 1800), day('2026-10-28', 0)], 'day');
    expect(spans.map((span) => span.start)).toEqual(['2026-10-27', '2026-10-28']);
    expect(spans[1]?.summary).toBeNull();
  });

  it('averages the days logged of each week, from Monday', () => {
    const spans = nutritionSpans(
      [
        day('2026-10-18', 2400),
        day('2026-10-19', 1800),
        day('2026-10-20', 0),
        day('2026-10-21', 2200),
      ],
      'week',
    );
    expect(spans.map((span) => span.start)).toEqual(['2026-10-12', '2026-10-19']);
    expect(spans[0]?.over).toBe(true);
    expect(spans[1]?.summary?.average.calories).toBe(2000);
    expect(spans[1]?.over).toBe(false);
  });

  it('groups the days of a year by month', () => {
    const spans = nutritionSpans([day('2026-09-30', 1800), day('2026-10-01', 1900)], 'month');
    expect(spans.map((span) => span.start)).toEqual(['2026-09-01', '2026-10-01']);
  });
});
