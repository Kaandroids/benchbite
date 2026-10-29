import { rangeStart } from './ranges';

describe('rangeStart', () => {
  it('goes back whole months from today', () => {
    const today = new Date(2026, 9, 29, 9, 0);
    expect(rangeStart('threeMonths', today)).toEqual(new Date(2026, 6, 29));
    expect(rangeStart('year', today)).toEqual(new Date(2025, 9, 29));
  });

  it('starts on the last day of a shorter month', () => {
    expect(rangeStart('month', new Date(2026, 2, 31))).toEqual(new Date(2026, 1, 28));
    expect(rangeStart('year', new Date(2028, 1, 29))).toEqual(new Date(2027, 1, 28));
  });
});
