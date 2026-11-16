import { scaled, totalOf, totalsOf } from './totals';

const totals = (calories: number) => ({ calories, proteinG: 10, carbsG: 20, fatG: 5 });

describe('totalOf', () => {
  it('adds up the entries', () => {
    expect(totalOf([totals(300), totals(200.5)])).toEqual({
      calories: 500.5,
      proteinG: 20,
      carbsG: 40,
      fatG: 10,
    });
  });
});

describe('scaled', () => {
  it('multiplies every value', () => {
    expect(scaled({ calories: 400, proteinG: 20, carbsG: 40, fatG: 8 }, 0.25)).toEqual({
      calories: 100,
      proteinG: 5,
      carbsG: 10,
      fatG: 2,
    });
  });
});

describe('totalsOf', () => {
  it('reads a row, a column typed as nullable as nothing', () => {
    expect(totalsOf({ kcal: 250, protein_g: 12, carbs_g: null, fat_g: 4 })).toEqual({
      calories: 250,
      proteinG: 12,
      carbsG: 0,
      fatG: 4,
    });
  });
});
