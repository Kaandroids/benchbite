import {
  changeInSuperset,
  joinedWithNext,
  joinWithNext,
  moveWithSupersets,
  supersetPlace,
  tidySupersets,
} from './supersets';

type Item = { key: string; superset?: number | null; restSeconds: number };

/** Exercises named by their key, in a superset where a number follows: "a1 b1 c". */
function list(spec: string, rest = 90): Item[] {
  return spec.split(' ').map((part) => {
    const superset = part.length > 1 ? Number(part.slice(1)) : null;
    return { key: part[0] ?? '', superset, restSeconds: rest };
  });
}

/** The exercises written back as list() takes them. */
function spec(items: Item[]): string {
  return items.map((item) => `${item.key}${item.superset ?? ''}`).join(' ');
}

describe('supersets', () => {
  it('says which exercises are joined and where a superset starts and ends', () => {
    const items = list('a1 b1 c1 d');
    expect([0, 1, 2, 3].map((i) => joinedWithNext(items, i))).toEqual([true, true, false, false]);
    expect(supersetPlace(items, 0)).toEqual({ first: true, last: false });
    expect(supersetPlace(items, 2)).toEqual({ first: false, last: true });
    expect(supersetPlace(items, 3)).toBeNull();
  });

  it('numbers supersets in order, with the rest of their first exercise, and drops one of one', () => {
    const items = [...list('a5 b5'), ...list('c'), ...list('d2')];
    items[1] = { ...items[1]!, restSeconds: 30 };
    const tidy = tidySupersets(items);
    expect(spec(tidy)).toBe('a1 b1 c d');
    expect(tidy.map((item) => item.restSeconds)).toEqual([90, 90, 90, 90]);
  });

  it('joins an exercise with the next, which takes its rest', () => {
    const items = list('a b c');
    items[1] = { ...items[1]!, restSeconds: 45 };
    const joined = joinWithNext(items, 0, true);
    expect(spec(joined)).toBe('a1 b1 c');
    expect(joined[1]?.restSeconds).toBe(90);
    expect(spec(joinWithNext(joined, 1, true))).toBe('a1 b1 c1');
  });

  it('joins two supersets into one', () => {
    expect(spec(joinWithNext(list('a1 b1 c2 d2'), 1, true))).toBe('a1 b1 c1 d1');
  });

  it('parts a superset in two, and a part of one is no superset', () => {
    expect(spec(joinWithNext(list('a1 b1 c1 d1'), 1, false))).toBe('a1 b1 c2 d2');
    expect(spec(joinWithNext(list('a1 b1 c1'), 1, false))).toBe('a1 b1 c');
    expect(spec(joinWithNext(list('a1 b1'), 0, false))).toBe('a b');
  });

  it('changes the order within a superset', () => {
    expect(spec(moveWithSupersets(list('a1 b1 c1 d'), 0, 2))).toBe('b1 c1 a1 d');
  });

  it('lets an exercise dragged out of its superset leave it', () => {
    expect(spec(moveWithSupersets(list('a1 b1 c1 d'), 1, 3))).toBe('a1 c1 d b');
    expect(spec(moveWithSupersets(list('a1 b1 c'), 0, 2))).toBe('b c a');
  });

  it('moves an exercise dropped inside another superset past it, the way it was moving', () => {
    expect(spec(moveWithSupersets(list('a b1 c1 d1 e'), 0, 2))).toBe('b1 c1 d1 a e');
    expect(spec(moveWithSupersets(list('a1 b1 c d2 e2'), 0, 3))).toBe('b c d1 e1 a');
    expect(spec(moveWithSupersets(list('a b1 c1 d1 e'), 4, 2))).toBe('a e b1 c1 d1');
  });

  it('passes a superset a step at a time, as a screen reader moves a row', () => {
    expect(spec(moveWithSupersets(list('a1 b1 c'), 2, 1))).toBe('c a1 b1');
    expect(spec(moveWithSupersets(list('x a1 b1 c'), 3, 2))).toBe('x c a1 b1');
    expect(spec(moveWithSupersets(list('c a1 b1'), 0, 1))).toBe('a1 b1 c');
  });

  it('gives a rest changed in a superset to all its exercises', () => {
    const items = list('a1 b1 c');
    const changed = changeInSuperset(items, { ...items[0]!, restSeconds: 120 });
    expect(changed.map((item) => item.restSeconds)).toEqual([120, 120, 90]);
  });
});
