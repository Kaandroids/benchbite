import { latestByExercise, recordsThisMonth, type BeatenRecord } from './record-history';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const record = (exerciseId: string, day: string): BeatenRecord => ({
  exerciseId,
  kind: 'heaviest',
  value: 80,
  previous: 75,
  set: { weightKg: 80, reps: 5, seconds: null, meters: null },
  logId: 1,
  day,
});

const RECORDS = [
  record('Squat', '2026-10-27'),
  record('Bench', '2026-10-21'),
  record('Squat', '2026-09-30'),
];

it('keeps the records of the month of today', () => {
  expect(recordsThisMonth(RECORDS, new Date(2026, 9, 29)).map((r) => r.day)).toEqual([
    '2026-10-27',
    '2026-10-21',
  ]);
});

it("keeps each exercise's latest record", () => {
  expect(latestByExercise(RECORDS).map((r) => r.day)).toEqual(['2026-10-27', '2026-10-21']);
});
