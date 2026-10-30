import { paceToKg } from '@/i18n/units';
import { WEIGHT_RANGE_KG } from '@/weight/range';

import {
  HEIGHT_RANGE_CM,
  activityShare,
  MIN_AGE,
  MIN_HEALTHY_BMI,
  PACE_RANGES,
  ageIn,
  bmi,
  defaultTargetKg,
  isTargetInGoalDirection,
  isTargetReached,
  goalPace,
  isPaceHeldUp,
  isPaceInRange,
  isTooLightToLose,
  minHealthyWeightKg,
  paceLevel,
  paceRange,
  projectedDate,
  snapPace,
  startingPace,
  targetWeightProblem,
} from './body';

describe('body rules', () => {
  it('only allows adults and a healthy BMI floor', () => {
    expect(MIN_AGE).toBe(18);
    expect(MIN_HEALTHY_BMI).toBe(18.5);
  });

  it('accepts the weights and heights the database accepts', () => {
    expect(WEIGHT_RANGE_KG).toEqual({ min: 30, max: 300 });
    expect(HEIGHT_RANGE_CM).toEqual({ min: 100, max: 250 });
  });

  it('counts the age reached this year, whatever the birthday', () => {
    expect(ageIn(2026, 2008)).toBe(18);
    expect(ageIn(2026, 2009)).toBe(17);
    expect(ageIn(2026, 1970)).toBe(56);
  });

  it('calculates the body mass index from kilograms and centimetres', () => {
    expect(bmi(81, 180)).toBeCloseTo(25);
    expect(bmi(64, 160)).toBeCloseTo(25);
    expect(bmi(50, 200)).toBeCloseTo(12.5);
  });

  it('finds the lowest healthy weight, rounded up to a tenth', () => {
    // 18.5 × 1.8² = 59.94
    expect(minHealthyWeightKg(180)).toBe(60);
    // 18.5 × 1.75² = 56.65625
    expect(minHealthyWeightKg(175)).toBe(56.7);
    // 18.5 × 1.6² = 47.36
    expect(minHealthyWeightKg(160)).toBe(47.4);
  });

  it('keeps the lowest healthy weight at or above the BMI floor', () => {
    for (let height = HEIGHT_RANGE_CM.min; height <= HEIGHT_RANGE_CM.max; height++) {
      const weight = minHealthyWeightKg(height);
      expect(bmi(weight, height)).toBeGreaterThanOrEqual(MIN_HEALTHY_BMI);
      expect(bmi(weight - 0.1, height)).toBeLessThan(MIN_HEALTHY_BMI);
    }
  });

  it('expects a lower target for losing fat and a higher one for building muscle', () => {
    expect(isTargetInGoalDirection('lose_fat', 80, 75)).toBe(true);
    expect(isTargetInGoalDirection('lose_fat', 80, 85)).toBe(false);
    expect(isTargetInGoalDirection('build_muscle', 70, 75)).toBe(true);
    expect(isTargetInGoalDirection('build_muscle', 70, 65)).toBe(false);
  });

  it('rejects a target equal to the current weight', () => {
    expect(isTargetInGoalDirection('lose_fat', 80, 80)).toBe(false);
    expect(isTargetInGoalDirection('build_muscle', 80, 80)).toBe(false);
  });

  it('rejects a target the database would store as the current weight', () => {
    // 176.3 lb and 176.4 lb are 79.97 kg and 80.01 kg, both 80.0 kg in the database.
    expect(isTargetInGoalDirection('build_muscle', 79.97, 80.01)).toBe(false);
    expect(isTargetInGoalDirection('lose_fat', 80.01, 79.97)).toBe(false);
    expect(isTargetInGoalDirection('build_muscle', 79.97, 80.06)).toBe(true);
  });

  it('puts a pace back on the slider’s steps after the trip through kilograms', () => {
    // 1 lb is saved as 0.45 kg, which reads back as 0.99 lb.
    expect(snapPace(0.99, PACE_RANGES.lb.lose_fat)).toBe(1);
    expect(snapPace(2.01, PACE_RANGES.lb.lose_fat)).toBe(2);
    expect(snapPace(0.44, PACE_RANGES.lb.build_muscle)).toBe(0.45);
    expect(snapPace(0.5, PACE_RANGES.kg.lose_fat)).toBe(0.5);
    expect(snapPace(5, PACE_RANGES.kg.lose_fat)).toBe(0.9);
  });

  it('offers paces up to about two pounds a week for losing and one for gaining', () => {
    expect(PACE_RANGES.kg.lose_fat).toEqual({ min: 0.25, max: 0.9, step: 0.05, default: 0.5 });
    expect(PACE_RANGES.kg.build_muscle).toEqual({
      min: 0.1,
      max: 0.45,
      step: 0.05,
      default: 0.25,
    });
    expect(PACE_RANGES.lb.lose_fat).toEqual({ min: 0.5, max: 2, step: 0.1, default: 1 });
    expect(PACE_RANGES.lb.build_muscle).toEqual({ min: 0.25, max: 1, step: 0.05, default: 0.5 });
  });

  it('keeps every default pace within its range', () => {
    for (const unit of ['kg', 'lb'] as const) {
      for (const goal of ['lose_fat', 'build_muscle'] as const) {
        const range = PACE_RANGES[unit][goal];
        expect(range.default).toBeGreaterThanOrEqual(range.min);
        expect(range.default).toBeLessThanOrEqual(range.max);
      }
    }
  });

  it('rates losing up to 1 % a week ideal, up to 1.5 % ambitious and more aggressive', () => {
    expect(paceLevel('lose_fat', 100, 0.5)).toBe('ideal');
    expect(paceLevel('lose_fat', 100, 1)).toBe('ideal');
    expect(paceLevel('lose_fat', 100, 1.2)).toBe('ambitious');
    expect(paceLevel('lose_fat', 100, 1.5)).toBe('ambitious');
    expect(paceLevel('lose_fat', 100, 1.6)).toBe('aggressive');
  });

  it('rates gaining up to 0.5 % a week ideal, up to 1 % ambitious and more aggressive', () => {
    expect(paceLevel('build_muscle', 80, 0.25)).toBe('ideal');
    expect(paceLevel('build_muscle', 80, 0.4)).toBe('ideal');
    expect(paceLevel('build_muscle', 80, 0.6)).toBe('ambitious');
    expect(paceLevel('build_muscle', 80, 0.8)).toBe('ambitious');
    expect(paceLevel('build_muscle', 80, 0.85)).toBe('aggressive');
  });

  it('rates the same pace as more demanding for a lighter body', () => {
    expect(paceLevel('lose_fat', 100, 0.9)).toBe('ideal');
    expect(paceLevel('lose_fat', 50, 0.9)).toBe('aggressive');
  });

  it('projects the date the target is reached at a steady pace', () => {
    const from = new Date(2026, 0, 1);
    // 5 kg at 0.5 kg a week: 10 weeks, 70 days.
    expect(projectedDate(80, 75, 0.5, from)).toEqual(new Date(2026, 2, 12));
    // 2 kg gained at 0.25 kg a week: 8 weeks, 56 days.
    expect(projectedDate(70, 72, 0.25, from)).toEqual(new Date(2026, 1, 26));
  });

  it('rounds a partial day up', () => {
    // 1 kg at 0.3 kg a week: 23.3 days.
    expect(projectedDate(80, 79, 0.3, new Date(2026, 0, 1))).toEqual(new Date(2026, 0, 25));
  });

  it('does not change the start date', () => {
    const from = new Date(2026, 0, 1);
    projectedDate(80, 75, 0.5, from);
    expect(from).toEqual(new Date(2026, 0, 1));
  });
});

describe('target weights', () => {
  // 180 cm: the lowest healthy weight is 60 kg.
  it("accepts a target in the goal's direction", () => {
    expect(targetWeightProblem('lose_fat', 80, 75, 180)).toBeNull();
    expect(targetWeightProblem('build_muscle', 80, 83, 180)).toBeNull();
  });

  it('refuses a target on the wrong side of the current weight', () => {
    expect(targetWeightProblem('lose_fat', 80, 85, 180)).toBe('wrongDirection');
    expect(targetWeightProblem('lose_fat', 80, 80, 180)).toBe('wrongDirection');
    expect(targetWeightProblem('build_muscle', 80, 78, 180)).toBe('wrongDirection');
  });

  it('tells a target that is stored as the current weight apart', () => {
    expect(targetWeightProblem('lose_fat', 80, 79.96, 180)).toBe('tooClose');
    expect(targetWeightProblem('build_muscle', 80, 80.04, 180)).toBe('tooClose');
  });

  it('refuses losing fat below a healthy weight', () => {
    expect(targetWeightProblem('lose_fat', 70, 59.9, 180)).toBe('belowHealthy');
    expect(targetWeightProblem('lose_fat', 70, 60, 180)).toBeNull();
  });

  it("starts a few kilograms in the goal's direction, but not below a healthy weight", () => {
    expect(defaultTargetKg('lose_fat', 80, 180)).toBe(75);
    expect(defaultTargetKg('build_muscle', 80, 180)).toBe(83);
    expect(defaultTargetKg('lose_fat', 62, 180)).toBe(60);
  });
});

describe('isTargetReached', () => {
  it('is reached at or past the target in the direction of the goal', () => {
    expect(isTargetReached('lose_fat', 80, 80)).toBe(true);
    expect(isTargetReached('lose_fat', 80.1, 80)).toBe(false);
    expect(isTargetReached('build_muscle', 75, 74)).toBe(true);
    expect(isTargetReached('build_muscle', 73.9, 74)).toBe(false);
  });

  it('is never reached by a goal that keeps the weight', () => {
    expect(isTargetReached('get_stronger', 80, 80)).toBe(false);
  });
});

describe('isPaceInRange', () => {
  it('takes a pace the slider offers in the unit, from either unit', () => {
    expect(isPaceInRange('kg', 'lose_fat', 80, 0.68)).toBe(true);
    // 2 lb a week, saved as 0.91 kg.
    expect(isPaceInRange('kg', 'lose_fat', 80, 0.91)).toBe(true);
    expect(isPaceInRange('kg', 'lose_fat', 80, 1.2)).toBe(false);
    expect(isPaceInRange('lb', 'build_muscle', 80, 0.1)).toBe(false);
  });

  it('takes no loss faster than the slider offers for the weight', () => {
    expect(isPaceInRange('kg', 'lose_fat', 55, 0.8)).toBe(true);
    expect(isPaceInRange('kg', 'lose_fat', 55, 0.9)).toBe(false);
  });
});

describe('paceRange', () => {
  it('stops losing at 1.5 % of body weight a week, on the steps, below the fastest pace', () => {
    expect(paceRange('kg', 'lose_fat', 100).max).toBe(0.9);
    // 1.5 % of 55 kg is 0.825 kg; of 121 lb, 1.82 lb.
    expect(paceRange('kg', 'lose_fat', 55).max).toBe(0.8);
    expect(paceRange('lb', 'lose_fat', 55).max).toBe(1.8);
    expect(paceRange('kg', 'lose_fat', 30).max).toBe(0.45);
  });

  it('never stops at a pace the app calls aggressive, in either unit', () => {
    // 1.8 lb is 0.82 kg once saved, 1.51 % of 54.45 kg.
    expect(paceRange('lb', 'lose_fat', 54.45).max).toBe(1.7);
    for (let weightKg = 30; weightKg <= 61; weightKg += 0.1) {
      for (const unit of ['kg', 'lb'] as const) {
        const max = paceToKg(unit, paceRange(unit, 'lose_fat', weightKg).max);
        expect(paceLevel('lose_fat', weightKg, max)).not.toBe('aggressive');
      }
    }
  });
});

describe('dating the goal', () => {
  const from = new Date(2026, 0, 1);

  it('dates by the chosen pace, unless the floor holds the targets below it', () => {
    // 5 kg at 0.5 kg a week takes 10 weeks.
    expect(goalPace(80, 75, 0.5, null, from)).toEqual({
      kind: 'chosen',
      paceKg: 0.5,
      date: new Date(2026, 2, 12),
    });
    // Within rounding, the chosen pace still.
    expect(goalPace(80, 75, 0.5, 0.49, from).kind).toBe('chosen');
    expect(goalPace(80, 75, 0.9, 0.5, from)).toEqual({
      kind: 'heldUp',
      paceKg: 0.5,
      date: new Date(2026, 2, 12),
    });
  });

  it('gives no date when the targets keep the weight', () => {
    expect(goalPace(50, 47, 0.5, 0, from)).toEqual({ kind: 'none', paceKg: 0, date: null });
    expect(isPaceHeldUp(0.5, 0)).toBe(true);
  });

  it('keeps the paces of a goal to gain', () => {
    expect(paceRange('kg', 'build_muscle', 45)).toEqual({
      ...PACE_RANGES.kg.build_muscle,
      byWeight: false,
    });
    expect(paceRange('kg', 'lose_fat', 55).byWeight).toBe(true);
    expect(paceRange('kg', 'lose_fat', 60).byWeight).toBe(false);
  });
});

describe('starting points', () => {
  it('does not let someone at the lower end of a healthy weight lose more', () => {
    expect(isTooLightToLose(60, 180)).toBe(true);
    expect(isTooLightToLose(60.1, 180)).toBe(false);
  });

  it("starts the pace at the saved one, on the slider's steps, or at the default", () => {
    expect(startingPace('kg', 'lose_fat', 80, 0.75)).toBe(0.75);
    expect(startingPace('kg', 'lose_fat', 80, null)).toBe(0.5);
    expect(startingPace('kg', 'build_muscle', 80, undefined)).toBe(0.25);
    // 1 lb a week comes back from kilograms as 0.99 lb.
    expect(startingPace('lb', 'lose_fat', 80, 0.45)).toBe(1);
    // Saved before the fastest pace came down, or for a weight that has since gone down.
    expect(startingPace('kg', 'lose_fat', 80, 1.2)).toBe(0.9);
    expect(startingPace('kg', 'lose_fat', 55, 0.9)).toBe(0.8);
  });
});

describe('activity factors', () => {
  it('says how much more each level burns than mostly sitting', () => {
    expect(activityShare('sedentary')).toBe(0);
    expect(Math.round(activityShare('light') * 100)).toBe(15);
    expect(Math.round(activityShare('moderate') * 100)).toBe(29);
    expect(Math.round(activityShare('active') * 100)).toBe(44);
  });
});
