import { niceStep, ticksOf } from './progress-chart';

jest.mock('react-native-svg', () => ({}));

describe('niceStep', () => {
  it('rounds a step up to 1, 2, 2.5 or 5 times a power of ten', () => {
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(7.5)).toBe(10);
    expect(niceStep(18)).toBe(20);
    expect(niceStep(240)).toBe(250);
    expect(niceStep(5)).toBe(5);
  });
});

describe('ticksOf', () => {
  it('puts round values around the lowest and the highest', () => {
    expect(ticksOf([70, 72.5, 75, 80, 85])).toEqual([70, 80, 90]);
    expect(ticksOf([40, 45, 75, 50])).toEqual([40, 60, 80]);
  });

  it('puts a single value between two lines', () => {
    expect(ticksOf([80])).toEqual([70, 80, 90]);
    expect(ticksOf([2])).toEqual([1, 2, 3]);
  });
});
