import { EMPTY_SET } from '@/sets/values';

import { firstTargets, resizeTargets, setTargetsOf, targetAt, withTarget } from './set-targets';

const target = (weightKg: number | null, reps: number | null, seconds: number | null = null) => ({
  weightKg,
  reps,
  seconds,
});

describe('setTargetsOf', () => {
  it('reads the targets the database keeps', () => {
    expect(setTargetsOf([{ weightKg: 80, reps: 10 }, { seconds: 45 }])).toEqual([
      target(80, 10),
      target(null, null, 45),
    ]);
  });

  it('gives none without targets', () => {
    expect(setTargetsOf(null)).toBeNull();
    expect(setTargetsOf([])).toBeNull();
  });
});

describe('targetAt', () => {
  it('gives a set after the last target the last one', () => {
    const targets = [target(80, 10), target(85, 8)];
    expect(targetAt(targets, 1)).toEqual(target(85, 8));
    expect(targetAt(targets, 2)).toEqual(target(85, 8));
  });
});

describe('resizeTargets', () => {
  const targets = [target(80, 10), target(85, 8), target(90, 6)];

  it('gives a set added the last target', () => {
    expect(resizeTargets(targets, 4)).toEqual([...targets, target(90, 6)]);
  });

  it('drops the target of a set removed', () => {
    expect(resizeTargets(targets, 2)).toEqual(targets.slice(0, 2));
  });

  it('keeps none as none', () => {
    expect(resizeTargets(null, 3)).toBeNull();
  });
});

describe('withTarget', () => {
  it('changes one set’s target and keeps the others', () => {
    expect(withTarget([target(80, 10), target(85, 8)], 3, 1, target(90, 6))).toEqual([
      target(80, 10),
      target(90, 6),
      target(85, 8),
    ]);
  });
});

describe('firstTargets', () => {
  const last = [
    { ...EMPTY_SET, weightKg: 75, reps: 12 },
    { ...EMPTY_SET, weightKg: 80, reps: 10 },
  ];

  it('starts each set from last time’s weight and the bottom of the range', () => {
    expect(firstTargets(3, { reps: { min: 8, max: 12 } }, last, true)).toEqual([
      target(75, 8),
      target(80, 8),
      target(80, 8),
    ]);
  });

  it('starts without a weight for an exercise never done or done with the body', () => {
    expect(firstTargets(2, { reps: { min: 6, max: 10 } }, undefined, true)).toEqual([
      target(null, 6),
      target(null, 6),
    ]);
    expect(firstTargets(1, { reps: { min: 6, max: 10 } }, last, false)).toEqual([target(null, 6)]);
  });

  it('starts a timed set from the target time', () => {
    expect(firstTargets(2, { seconds: 45, meters: null }, undefined, false)).toEqual([
      target(null, null, 45),
      target(null, null, 45),
    ]);
  });
});
