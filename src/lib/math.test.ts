import { clamp, parseDecimal, range } from './math';

describe('range', () => {
  it('includes both ends', () => {
    expect(range(3, 6)).toEqual([3, 4, 5, 6]);
    expect(range(0, 0)).toEqual([0]);
  });

  it('is empty when it ends before it starts', () => {
    expect(range(5, 4)).toEqual([]);
  });
});

describe('parseDecimal', () => {
  it('reads a point or a comma as the decimal separator', () => {
    expect(parseDecimal('80.5')).toBe(80.5);
    expect(parseDecimal(' 80,5 ')).toBe(80.5);
  });

  it('is null for text that is no number', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('  ')).toBeNull();
    expect(parseDecimal('1,2,3')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
  });
});

describe('clamp', () => {
  it('keeps a value inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it('moves a value outside to the nearest end', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
