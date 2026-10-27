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
    // 100.005 g in all, which the table keeps as 100.01 g.
    expect(
      readForm({ ...YOGHURT, protein: '33.335', carbs: '33.335', fat: '33.335', kcal: '500' }),
    ).toEqual({ kind: 'problem', problem: 'tooMuchMacros' });
    expect(readForm({ ...YOGHURT, unit: 'can', portionGrams: '9000' })).toEqual({
      kind: 'problem',
      problem: 'portion',
    });
  });
});

describe('macroCheck', () => {
  it('adds up the macros and says whether they are close to the calories', () => {
    expect(macroCheck(YOGHURT)).toEqual({ calories: 68.7, entered: 70, close: true });
    expect(macroCheck({ ...YOGHURT, kcal: '200' })).toEqual({
      calories: 68.7,
      entered: 200,
      close: false,
    });
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
      unit: 'serving',
      portionGrams: '200',
    });
  });
});
