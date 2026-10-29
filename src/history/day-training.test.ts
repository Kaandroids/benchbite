import { trainingSummary, type DayTraining } from './day-training';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const day = (minutes: number, liftedKg = 0, done = 0, missed = 0): DayTraining => ({
  day: '2026-10-19',
  minutes,
  liftedKg,
  done,
  missed,
});

describe('trainingSummary', () => {
  it('adds up the days trained, the plan and what was done in them', () => {
    expect(trainingSummary([day(60, 1200, 1), day(0, 0, 0, 1), day(30), day(0)])).toEqual({
      days: 2,
      done: 1,
      planned: 2,
      minutes: 90,
      liftedKg: 1200,
    });
  });
});
