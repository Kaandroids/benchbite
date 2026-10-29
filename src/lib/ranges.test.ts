import { rangeStart } from './ranges';

describe('rangeStart', () => {
  it('goes back whole months from today', () => {
    const today = new Date(2026, 9, 29, 9, 0);
    expect(rangeStart('threeMonths', today)).toEqual(new Date(2026, 6, 29));
    expect(rangeStart('year', today)).toEqual(new Date(2025, 9, 29));
  });
});
