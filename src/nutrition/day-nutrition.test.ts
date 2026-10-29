import { isOverTarget, nutritionSummary, type DayNutrition } from './day-nutrition';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const TARGETS = { calories: 2000, proteinG: 150, carbsG: 200, fatG: 60 };

const day = (
  date: string,
  calories: number,
  entries = 1,
  targets: DayNutrition['targets'] = TARGETS,
): DayNutrition => ({
  day: date,
  eaten: { calories, proteinG: calories / 20, carbsG: calories / 10, fatG: calories / 40 },
  entries,
  targets,
  keptTarget: targets !== null && calories > 0 && calories <= targets.calories,
});

describe('nutritionSummary', () => {
  it('adds up only the days logged, against their targets', () => {
    const week = nutritionSummary([
      day('2026-10-19', 1800),
      day('2026-10-20', 0, 0),
      day('2026-10-21', 2200),
    ]);
    expect(week).toEqual({
      days: 2,
      // 2,200 kcal is over the target of 2,000.
      withinTarget: 1,
      eaten: { calories: 4000, proteinG: 200, carbsG: 400, fatG: 100 },
      average: { calories: 2000, proteinG: 100, carbsG: 200, fatG: 50 },
      targets: { calories: 4000, proteinG: 300, carbsG: 400, fatG: 120 },
      averageTargets: TARGETS,
    });
  });

  it('counts a day logged with no calories as logged', () => {
    expect(nutritionSummary([day('2026-10-19', 0, 1), day('2026-10-20', 2000)])?.days).toBe(2);
  });

  it('has no targets for a user without them', () => {
    expect(nutritionSummary([day('2026-10-19', 1800, 1, null)])?.targets).toBeNull();
  });

  it('averages the targets over the days logged that have them', () => {
    expect(
      nutritionSummary([
        day('2026-10-19', 1800),
        day('2026-10-20', 1800, 1, { ...TARGETS, calories: 2400 }),
        day('2026-10-21', 1800, 1, null),
        day('2026-10-22', 0, 0, { ...TARGETS, calories: 9000 }),
      ])?.averageTargets?.calories,
    ).toBe(2200);
  });

  it('is null for a week without entries', () => {
    expect(nutritionSummary([day('2026-10-19', 0, 0)])).toBeNull();
    expect(nutritionSummary([])).toBeNull();
  });
});

describe('isOverTarget', () => {
  it('is over only past the target, and never without one', () => {
    expect(isOverTarget(day('2026-10-19', 2001))).toBe(true);
    expect(isOverTarget(day('2026-10-19', 2000))).toBe(false);
    expect(isOverTarget(day('2026-10-19', 5000, 1, null))).toBe(false);
  });
});

