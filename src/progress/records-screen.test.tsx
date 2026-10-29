import { router } from 'expo-router';

import { useExerciseLibrary } from '@/exercises/library';
import { useRecordHistory, type BeatenRecord } from '@/history/record-history';
import { fireEvent, render, screen } from '@/test/render';

import { RecordsButton } from './records-button';
import { RecordsScreen } from './records-screen';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/exercises/library', () => ({
  ...jest.requireActual<typeof import('@/exercises/library')>('@/exercises/library'),
  useExerciseLibrary: jest.fn(),
}));
jest.mock('@/history/record-history', () => ({
  ...jest.requireActual<typeof import('@/history/record-history')>('@/history/record-history'),
  useRecordHistory: jest.fn(),
}));

const loaded = <T,>(data: T) => ({
  data,
  isPending: false,
  isError: false,
  isFetching: false,
  refetch: jest.fn(),
});

const TODAY = new Date(2026, 9, 29);

const record = (
  exerciseId: string,
  day: string,
  kind: BeatenRecord['kind'],
  value: number,
  previous: number,
): BeatenRecord => ({
  exerciseId,
  kind,
  value,
  previous,
  set: { weightKg: value, reps: 5, seconds: null, meters: null },
  logId: Number(day.replaceAll('-', '')),
  day,
});

const RECORDS = [
  record('bench', '2026-10-27', 'heaviest', 82.5, 80),
  record('pullup', '2026-10-08', 'heaviest', 10, 5),
  record('squat', '2025-09-24', 'one_rep_max', 118, 114),
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: TODAY });
  jest.mocked(useExerciseLibrary).mockReturnValue(
    loaded([
      { id: 'bench', name: 'Bench press', metrics: ['weight', 'reps'], imagePaths: [] },
      { id: 'pullup', name: 'Pull-up', metrics: ['reps'], imagePaths: [] },
      { id: 'squat', name: 'Squat', metrics: ['weight', 'reps'], imagePaths: [] },
    ]) as never,
  );
  jest.mocked(useRecordHistory).mockReturnValue(loaded(RECORDS) as never);
});

describe('RecordsScreen', () => {
  it('lists the records by month, the latest first, with how much each beat the best', async () => {
    await render(<RecordsScreen />);
    expect(screen.getByText('This month')).toBeTruthy();
    expect(screen.getByText('September 2025')).toBeTruthy();
    expect(screen.getByText('Bench press')).toBeTruthy();
    expect(screen.getByText('Heaviest · Oct 27')).toBeTruthy();
    expect(screen.getByText('82.5 kg')).toBeTruthy();
    expect(screen.getByText('+2.5 kg')).toBeTruthy();
    // Weight added to a bodyweight exercise.
    expect(screen.getByText('Heaviest added · Oct 8')).toBeTruthy();
    expect(screen.getByText('Est. 1RM · Sep 24, 2025')).toBeTruthy();
  });

  it("opens a record's exercise", async () => {
    await render(<RecordsScreen />);
    await fireEvent.press(screen.getByText('Bench press'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/progress/exercise-history',
      params: { id: 'bench' },
    });
  });

  it("lists each exercise's latest record by its name", async () => {
    jest
      .mocked(useRecordHistory)
      .mockReturnValue(
        loaded([...RECORDS, record('bench', '2026-10-01', 'heaviest', 80, 77.5)]) as never,
      );
    await render(<RecordsScreen />);
    await fireEvent.press(screen.getByText('By exercise'));
    expect(screen.queryByText('This month')).toBeNull();
    expect(
      screen.getAllByText(/^(Bench press|Pull-up|Squat)$/).map((t) => t.props.children),
    ).toEqual(['Bench press', 'Pull-up', 'Squat']);
    expect(screen.queryByText('80 kg')).toBeNull();
  });

  it('says how to set a record when there is none', async () => {
    jest.mocked(useRecordHistory).mockReturnValue(loaded([]) as never);
    await render(<RecordsScreen />);
    expect(screen.getByText('No records yet')).toBeTruthy();
  });
});

describe('RecordsButton', () => {
  it('says how many records are new this month and the latest, and opens them', async () => {
    await render(<RecordsButton today={TODAY} />);
    expect(screen.getByText('2 new this month · Bench press 82.5 kg')).toBeTruthy();
    await fireEvent.press(screen.getByText('Personal records'));
    expect(router.push).toHaveBeenCalledWith('/progress/records');
  });

  it('says how to set one without records', async () => {
    jest.mocked(useRecordHistory).mockReturnValue(loaded([]) as never);
    await render(<RecordsButton today={TODAY} />);
    expect(screen.getByText('Beat a best of an exercise to set one')).toBeTruthy();
  });
});
