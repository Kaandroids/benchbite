import { EMPTY_FORM, formOf, macroCheck, readForm, type FoodForm } from './food-form';

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

  it('scales values per portion to 100 g', () => {
    const result = readForm({
      ...YOGHURT,
      kcal: '140',
      protein: '20',
      carbs: '13',
      fat: '0.6',
      basis: 'perPortion',
      unit: 'serving',
      portionGrams: '200',
    });
    expect(result).toEqual({
      kind: 'valid',
      values: {
        name: 'Protein yoghurt, vanilla',
        per100g: { calories: 70, proteinG: 10, carbsG: 6.5, fatG: 0.3 },
        portion: { unit: 'serving', grams: 200 },
      },
    });
  });

  it('waits for a name and every value', () => {
    expect(readForm({ ...YOGHURT, name: '  ' })).toEqual({ kind: 'incomplete' });
    expect(readForm({ ...YOGHURT, fat: '' })).toEqual({ kind: 'incomplete' });
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
    // 1 + 1 + 5 g in 7 g is 100 g per 100 g exactly, but 100.01 g once rounded as stored.
    expect(
      readForm({
        ...YOGHURT,
        protein: '1',
        carbs: '1',
        fat: '5',
        kcal: '60',
        basis: 'perPortion',
        unit: 'piece',
        portionGrams: '7',
      }),
    ).toEqual({ kind: 'problem', problem: 'tooMuchMacros' });
    expect(readForm({ ...YOGHURT, unit: 'can', portionGrams: '9000' })).toEqual({
      kind: 'problem',
      problem: 'portion',
    });
  });
});

describe('macroCheck', () => {
  it('adds up the macros and says whether they are close to the calories', () => {
    expect(macroCheck(YOGHURT)).toEqual({ calories: 68.7, close: true });
    expect(macroCheck({ ...YOGHURT, kcal: '200' })).toEqual({ calories: 68.7, close: false });
  });

  it('has nothing to check until calories and a macro are typed', () => {
    expect(macroCheck({ ...YOGHURT, kcal: '' })).toBeNull();
    expect(macroCheck({ ...YOGHURT, protein: '', carbs: '', fat: '' })).toBeNull();
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
      basis: 'per100g',
      unit: 'serving',
      portionGrams: '200',
    });
  });
});
