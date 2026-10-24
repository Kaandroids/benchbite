import { shortSet, summarizeSets } from './exercise-summary';
import { setKindOf } from './fields';
import type { SetValues } from './values';

const set = (values: Partial<SetValues>): SetValues => ({
  weightKg: null,
  reps: null,
  seconds: null,
  meters: null,
  ...values,
});
const reps = { reps: { min: 8, max: 12 } };
const weighted = setKindOf(['weight', 'reps'], reps);
const bodyweight = setKindOf(['reps'], reps);
const held = setKindOf(['duration'], { seconds: 45, meters: null });
const distance = setKindOf(['distance', 'duration'], { seconds: null, meters: 2000 });

describe('summarizeSets', () => {
  it('takes the heaviest set, then the most reps, and adds up the weight lifted', () => {
    const sets = [
      set({ weightKg: 80, reps: 8 }),
      set({ weightKg: 85, reps: 6 }),
      set({ weightKg: 85, reps: 7 }),
    ];
    expect(summarizeSets(sets, weighted)).toEqual({
      best: sets[2],
      total: { kind: 'volume', kilograms: 80 * 8 + 85 * 6 + 85 * 7 },
    });
  });

  it('adds up the reps of a bodyweight exercise without added weight', () => {
    const sets = [set({ reps: 14 }), set({ reps: 12 })];
    expect(summarizeSets(sets, bodyweight)).toEqual({
      best: sets[0],
      total: { kind: 'reps', reps: 26 },
    });
  });

  it('takes the longest hold and the farthest distance', () => {
    expect(summarizeSets([set({ seconds: 45 }), set({ seconds: 50 })], held)).toEqual({
      best: set({ seconds: 50 }),
      total: { kind: 'time', seconds: 95 },
    });
    expect(
      summarizeSets([set({ meters: 2000, seconds: 492 }), set({ meters: 500 })], distance),
    ).toEqual({
      best: set({ meters: 2000, seconds: 492 }),
      total: { kind: 'distance', meters: 2500 },
    });
  });

  it('has no best set without sets', () => {
    expect(summarizeSets([], weighted).best).toBeNull();
  });
});

describe('shortSet', () => {
  it('leaves out the unit of the weight', () => {
    const describe = () => 'described';
    expect(shortSet(set({ weightKg: 80, reps: 8 }), weighted, describe)).toBe('80 × 8');
    expect(shortSet(set({ reps: 14 }), bodyweight, describe)).toBe('14');
    expect(shortSet(set({ seconds: 50 }), held, describe)).toBe('described');
  });
});
