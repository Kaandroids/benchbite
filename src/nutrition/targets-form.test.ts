import { readTargetsForm, targetsFormOf } from './targets-form';

const form = (calories: string, protein: string, carbs: string, fat: string) => ({
  calories,
  protein,
  carbs,
  fat,
});

describe('readTargetsForm', () => {
  it('reads whole numbers, and what the macros make', () => {
    expect(readTargetsForm(form('2200', '160', '240', '65'))).toEqual({
      kind: 'valid',
      targets: { calories: 2200, proteinG: 160, carbsG: 240, fatG: 65 },
      macroCalories: 2185,
    });
  });

  it('allows a few kcal over the calories, from rounding', () => {
    // 2,225 kcal from the macros against 2,200: 25 over, within 5 %.
    expect(readTargetsForm(form('2200', '160', '250', '65')).kind).toBe('valid');
  });

  it('refuses macros that make more than the calories', () => {
    expect(readTargetsForm(form('1800', '180', '240', '70'))).toEqual({
      kind: 'tooMuchMacros',
      macroCalories: 2310,
      calories: 1800,
    });
  });

  it('needs every value, whole and within its limits', () => {
    for (const values of [
      form('', '160', '240', '65'),
      form('2200.5', '160', '240', '65'),
      form('700', '10', '10', '10'),
      form('7000', '160', '240', '65'),
      form('2200', '600', '240', '65'),
    ]) {
      expect(readTargetsForm(values).kind).toBe('incomplete');
    }
  });

  it('starts from given targets', () => {
    expect(targetsFormOf({ calories: 1940, proteinG: 135, carbsG: 229, fatG: 54 })).toEqual(
      form('1940', '135', '229', '54'),
    );
  });
});
