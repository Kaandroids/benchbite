import { alternativesThatStay, type ChoiceAlternative, firstAlternatives } from './choice';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const alternative = (id: number, workoutId: number, held = false): ChoiceAlternative => ({
  id,
  workoutId,
  position: 2,
  name: null,
  held,
  lastUsedAt: null,
});

describe('alternativesThatStay', () => {
  it('keeps as many as the plan allows in all', () => {
    expect(
      alternativesThatStay([alternative(1, 1), alternative(2, 2)], { versions: 2, added: 1 }),
    ).toBe(1);
  });

  it('keeps of each workout as many as its versions allow, the one in use being one', () => {
    expect(
      alternativesThatStay([alternative(1, 1), alternative(2, 1), alternative(3, 1)], {
        versions: 3,
        added: null,
      }),
    ).toBe(2);
  });

  it('keeps none without any', () => {
    expect(alternativesThatStay([], { versions: 2, added: 1 })).toBe(0);
  });
});

describe('firstAlternatives', () => {
  it('starts from the ones that stay now, then the ones last used', () => {
    const candidates = [alternative(1, 1, true), alternative(2, 2), alternative(3, 3, true)];
    expect(firstAlternatives(candidates, 2)).toEqual([2, 1]);
  });
});
