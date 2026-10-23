import { router } from 'expo-router';
import { Alert } from 'react-native';

import { useExerciseLibrary } from '@/exercises/library';
import { act, fireEvent, render, screen } from '@/test/render';

import { useDeleteLog, useLoggedSets, useLogSummaries, type LogSummary } from './history';
import { HistoryScreen } from './history-screen';
import { LogScreen } from './log-screen';
import { RecentLogs } from './recent-logs';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/exercises/library', () => ({
  ...jest.requireActual<typeof import('@/exercises/library')>('@/exercises/library'),
  useExerciseLibrary: jest.fn(),
}));
jest.mock('./history', () => ({
  ...jest.requireActual<typeof import('./history')>('./history'),
  useLogSummaries: jest.fn(),
  useLoggedSets: jest.fn(),
  useDeleteLog: jest.fn(),
}));

const loaded = <T,>(data: T) => ({
  data,
  isPending: false,
  isError: false,
  isFetching: false,
  refetch: jest.fn(),
});

const log = (id: number, type: LogSummary['type'], start: Date, minutes: number): LogSummary => ({
  id,
  workoutId: 1,
  name: null,
  type,
  startedAt: start,
  finishedAt: new Date(start.getTime() + minutes * 60_000),
  exercises: 6,
  sets: 17,
  kilograms: 6240,
  estimatedKcal: 390,
});

// A Friday.
const FRIDAY = new Date(2026, 9, 23, 20, 0);
const LOGS = [
  log(3, 'push', new Date(2026, 9, 23, 18, 4), 52),
  log(2, 'legs', new Date(2026, 9, 21, 18, 0), 61),
  log(1, 'pull', new Date(2026, 9, 13, 18, 0), 54),
  log(0, 'legs', new Date(2026, 9, 6, 18, 0), 58),
];
const deleteLog = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: FRIDAY });
  jest.mocked(useLogSummaries).mockReturnValue(loaded(LOGS) as never);
  jest.mocked(useDeleteLog).mockReturnValue({
    mutateAsync: deleteLog.mockResolvedValue(undefined),
    isPending: false,
  } as never);
  jest.mocked(useExerciseLibrary).mockReturnValue(
    loaded([
      { id: 'bench', name: 'Bench press', metrics: ['weight', 'reps'], imagePaths: [] },
      { id: 'plank', name: 'Plank', metrics: ['duration'], imagePaths: [] },
    ]) as never,
  );
  jest.mocked(useLoggedSets).mockReturnValue(
    loaded([
      {
        exercisePosition: 0,
        exerciseId: 'bench',
        weightKg: 80,
        reps: 8,
        seconds: null,
        meters: null,
      },
      {
        exercisePosition: 0,
        exerciseId: 'bench',
        weightKg: 80,
        reps: 7,
        seconds: null,
        meters: null,
      },
      {
        exercisePosition: 2,
        exerciseId: 'plank',
        weightKg: null,
        reps: null,
        seconds: 50,
        meters: null,
      },
    ]) as never,
  );
});
afterEach(() => jest.useRealTimers());

describe('RecentLogs', () => {
  it('shows the latest three workouts and how many were this week', async () => {
    await render(<RecentLogs />);
    expect(screen.getByText('History · 2 this week')).toBeTruthy();
    expect(screen.getByText('FRI')).toBeTruthy();
    expect(screen.getByText('Push')).toBeTruthy();
    expect(screen.getByText('52 min · 17 sets · ~390 kcal')).toBeTruthy();
    expect(screen.getByText('1 h 1 min · 17 sets · ~390 kcal')).toBeTruthy();
    expect(screen.queryByText('Oct 6')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'See all' }));
    expect(router.push).toHaveBeenCalledWith('/workout/history');
    await fireEvent.press(screen.getAllByHintText('Opens the workout')[0]!);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workout/log/[id]',
      params: { id: '3' },
    });
  });

  it('says when nothing was logged yet', async () => {
    jest.mocked(useLogSummaries).mockReturnValue(loaded([]) as never);
    await render(<RecentLogs />);
    expect(screen.getByText('Your finished workouts will show here.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'See all' })).toBeNull();
  });
});

describe('HistoryScreen', () => {
  it('groups the workouts by week with their totals', async () => {
    await render(<HistoryScreen />);
    expect(screen.getByText('This week')).toBeTruthy();
    expect(screen.getByText('2 workouts · 1 h 53 min')).toBeTruthy();
    expect(screen.getByText('Last week')).toBeTruthy();
    expect(screen.getAllByText('1 workout · 54 min')).toHaveLength(1);
    expect(screen.getByText(/October 5/)).toBeTruthy();
    // With icons: the sets as a number that screen readers say in words.
    expect(screen.getByText('52 min')).toBeTruthy();
    expect(screen.getAllByLabelText('6 exercises')).toHaveLength(4);
    expect(screen.getAllByLabelText('17 sets')).toHaveLength(4);
  });
});

describe('LogScreen', () => {
  it('shows when, how long and how hard, and every set', async () => {
    await render(<LogScreen id={3} />);
    expect(screen.getByText('Push')).toBeTruthy();
    expect(screen.getByText('52:00')).toBeTruthy();
    expect(screen.getByText('6,240 kg')).toBeTruthy();
    expect(screen.getByText('~390')).toBeTruthy();
    expect(screen.getByText('Bench press')).toBeTruthy();
    expect(screen.getByText('80 kg × 8')).toBeTruthy();
    expect(screen.getByText('80 kg × 7')).toBeTruthy();
    expect(screen.getByText('0:50')).toBeTruthy();
  });

  it('deletes the workout after asking', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await render(<LogScreen id={3} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Delete from history' }));
    const confirm = alert.mock.calls[0]?.[2]?.find((button) => button.style === 'destructive');
    await act(async () => confirm?.onPress?.());
    expect(deleteLog).toHaveBeenCalledWith(3);
    expect(router.back).toHaveBeenCalled();
  });

  it('says when the workout does not exist', async () => {
    await render(<LogScreen id={99} />);
    expect(screen.getByText('Workout not found')).toBeTruthy();
  });
});
