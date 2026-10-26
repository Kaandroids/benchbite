import { backToBackRuns, MAX_TRAINING_DAYS, RECOMMENDED_DAYS, SESSION_MINUTES } from './training';

describe('training rules', () => {
  it('keeps at least one rest day a week', () => {
    expect(MAX_TRAINING_DAYS).toBe(6);
  });

  it('recommends more training days the more experienced the user is', () => {
    expect(RECOMMENDED_DAYS.beginner).toEqual([1, 3, 5]);
    expect(RECOMMENDED_DAYS.intermediate).toEqual([1, 2, 4, 5]);
    expect(RECOMMENDED_DAYS.advanced).toEqual([1, 2, 3, 5, 6]);
  });

  it('recommends distinct ISO weekdays in order, within the allowed number of days', () => {
    for (const days of Object.values(RECOMMENDED_DAYS)) {
      expect(days.length).toBeLessThanOrEqual(MAX_TRAINING_DAYS);
      expect([...days].sort((a, b) => a - b)).toEqual(days);
      expect(new Set(days).size).toBe(days.length);
      for (const day of days) {
        expect(day).toBeGreaterThanOrEqual(1);
        expect(day).toBeLessThanOrEqual(7);
      }
    }
  });

  it('rests on Sunday whatever the experience', () => {
    for (const days of Object.values(RECOMMENDED_DAYS)) {
      expect(days).not.toContain(7);
    }
  });

  it('offers sessions from half an hour to an hour and a quarter', () => {
    expect(SESSION_MINUTES).toEqual([30, 45, 60, 75]);
  });

  it('finds the runs of training days that follow each other', () => {
    expect(backToBackRuns([1, 3, 5])).toEqual([]);
    expect(backToBackRuns([1, 2, 4, 5])).toEqual([
      [1, 2],
      [4, 5],
    ]);
    // Sunday is followed by Monday, so a run can wrap around the week.
    expect(backToBackRuns([1, 6, 7])).toEqual([[6, 7, 1]]);
    expect(backToBackRuns([1, 2, 3, 4, 5, 6])).toEqual([[1, 2, 3, 4, 5, 6]]);
  });
});
