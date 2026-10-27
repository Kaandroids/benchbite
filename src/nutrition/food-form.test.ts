import { EMPTY_FORM, formOf, readForm, type FoodForm } from './food-form';

const YOGHURT: FoodForm = {
  ...EMPTY_FORM,
  name: ' Protein yoghurt, vanilla ',
  kcal: '70',
  protein: '10',
  carbs: '6,5',
  fat: '0.3',
};

describe('readForm', () => {
  it('reads the values per 100 g, trimmed, with a comma or a point', () => {
    expect(readForm(YOGHURT)).toEqual({
      kind: 'valid',
      values: {
        name: 'Protein yoghurt, vanilla',
        per100g: { calories: 70, proteinG: 10, carbsG: 6.5, fatG: 0.3 },
        portion: null,
      },
    });
  });

  it('keeps a portion with its grams', () => {
    expect(readForm({ ...YOGHURT, unit: 'cup', portionGrams: '200' })).toEqual({
      kind: 'valid',
      values: {
        name: 'Protein yoghurt, vanilla',
        per100g: { calories: 70, proteinG: 10, carbsG: 6.5, fatG: 0.3 },
        portion: { unit: 'cup', grams: 200 },
      },
    });
  });

  it('takes macros that add up to exactly 100 g, as the database does', () => {
    expect(
      readForm({ ...YOGHURT, protein: '0.2', carbs: '83.9', fat: '15.9', kcal: '480' }).kind,
    ).toBe('valid');
  });

  it('counts empty macros as 0', () => {
    expect(readForm({ ...YOGHURT, kcal: '4', protein: '1', carbs: '', fat: '' })).toEqual({
      kind: 'valid',
      values: {
        name: 'Protein yoghurt, vanilla',
        per100g: { calories: 4, proteinG: 1, carbsG: 0, fatG: 0 },
        portion: null,
      },
    });
  });

  it('waits for a name and the calories', () => {
    expect(readForm({ ...YOGHURT, name: '  ' })).toEqual({ kind: 'incomplete' });
    expect(readForm({ ...YOGHURT, kcal: '' })).toEqual({ kind: 'incomplete' });
    expect(readForm({ ...YOGHURT, fat: 'x' })).toEqual({ kind: 'incomplete' });
    expect(readForm({ ...YOGHURT, unit: 'serving' })).toEqual({ kind: 'incomplete' });
  });

  it('refuses what the database would refuse', () => {
    expect(readForm({ ...YOGHURT, kcal: '950' })).toEqual({
      kind: 'problem',
      problem: 'tooMuchEnergy',
    });
    expect(readForm({ ...YOGHURT, protein: '60', carbs: '50' })).toEqual({
      kind: 'problem',
      problem: 'tooMuchMacros',
    });
    // 100.005 g in all, which the table keeps as 100.01 g.
    expect(
      readForm({ ...YOGHURT, protein: '33.335', carbs: '33.335', fat: '33.335', kcal: '500' }),
    ).toEqual({ kind: 'problem', problem: 'tooMuchMacros' });
    expect(readForm({ ...YOGHURT, unit: 'can', portionGrams: '9000' })).toEqual({
      kind: 'problem',
      problem: 'portion',
    });
  });

  it('refuses fewer calories than the macros alone make, and allows more', () => {
    expect(readForm({ ...YOGHURT, kcal: '22', protein: '3', carbs: '0', fat: '22' })).toEqual({
      kind: 'problem',
      problem: 'tooFewCalories',
      calories: 210,
      entered: 22,
    });
    // Beer: most of its energy is alcohol, which the macros do not count.
    expect(readForm({ ...YOGHURT, kcal: '43', protein: '0.5', carbs: '3.6', fat: '0' }).kind).toBe(
      'valid',
    );
  });
});

describe('readForm, too few calories', () => {
  const kind = (form: FoodForm) => {
    const result = readForm(form);
    return result.kind === 'problem' ? result.problem : result.kind;
  };

  it('allows rounding on labels: 15 % of what the macros make, or 10 kcal', () => {
    // 67 from the macros, with about 10 kcal of tolerance.
    const label = { ...YOGHURT, protein: '5', carbs: '5', fat: '3' };
    expect(kind({ ...label, kcal: '57' })).toBe('valid');
    expect(kind({ ...label, kcal: '56' })).toBe('tooFewCalories');
    // 300 from the macros: 15 % is 45.
    const rich = { ...YOGHURT, protein: '0', carbs: '75', fat: '0' };
    expect(kind({ ...rich, kcal: '260' })).toBe('valid');
    expect(kind({ ...rich, kcal: '250' })).toBe('tooFewCalories');
  });

  it('shows while the name is still empty', () => {
    expect(kind({ ...YOGHURT, name: '', kcal: '22', protein: '3', carbs: '0', fat: '22' })).toBe(
      'tooFewCalories',
    );
  });
});

describe('formOf', () => {
  it('fills the form from a food of one’s own', () => {
    expect(
      formOf({
        ref: { kind: 'custom', id: 12 },
        name: 'Protein yoghurt',
        per100g: { calories: 70, proteinG: 10, carbsG: 6.5, fatG: 0.3 },
        portions: [{ unit: 'serving', grams: 200 }],
      }),
    ).toEqual({
      name: 'Protein yoghurt',
      kcal: '70',
      protein: '10',
      carbs: '6.5',
      fat: '0.3',
      unit: 'serving',
      portionGrams: '200',
    });
  });
});
