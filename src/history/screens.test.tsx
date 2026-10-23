import { router } from 'expo-router';
import { Alert } from 'react-native';

import { useExerciseLibrary } from '@/exercises/library';
import { act, fireEvent, render, screen } from '@/test/render';

import {
  useDeleteLog,
  useLoggedSets,
  useLogSummaries,
  useLogSummary,
  useRecentLogs,
  type LogSummary,
} from './history';
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
  useLogSummary: jest.fn(),
  useRecentLogs: jest.fn(),
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
  plannedExercises: null,
  sets: 17,
  plannedSets: null,
  kilograms: 6240,
  estimatedKcal: 390,
});

// A Friday.
const FRIDAY = new Date(2026, 9, 23, 20, 0);
const LOGS = [
  { ...log(3, 'push', new Date(2026, 9, 23, 18, 4), 52), plannedExercises: 8, plannedSets: 24 },
  log(2, 'legs', new Date(2026, 9, 21, 18, 0), 61),
  log(1, 'pull', new Date(2026, 9, 13, 18, 0), 54),
  log(0, 'legs', new Date(2026, 9, 6, 18, 0), 58),
];
const deleteLog = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: FRIDAY });
  jest.mocked(useLogSummaries).mockReturnValue(loaded(LOGS) as never);
  jest
    .mocked(useRecentLogs)
    .mockReturnValue(loaded({ latest: LOGS.slice(0, 3), thisWeek: 2 }) as never);
  jest
    .mocked(useLogSummary)
    .mockImplementation(
      (id: number) => loaded(LOGS.find((item) => item.id === id) ?? null) as never,
    );
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
    jest.mocked(useRecentLogs).mockReturnValue(loaded({ latest: [], thisWeek: 0 }) as never);
    await render(<RecentLogs />);
    expect(screen.getByText('Your finished workouts will show here.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'See all' })).toBeNull();
  });

  it('does not look empty while loading or after an error', async () => {
    jest.mocked(useRecentLogs).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      isFetching: false,
      refetch: jest.fn(),
    } as never);
    await render(<RecentLogs />);
    expect(screen.queryByText('Your finished workouts will show here.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
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
    // The first was finished early: 6 of 8 exercises, 17 of 24 sets.
    expect(screen.getByText('6/8')).toBeTruthy();
    expect(screen.getByLabelText('6 of 8 exercises')).toBeTruthy();
    expect(screen.getByText('17/24')).toBeTruthy();
    expect(screen.getAllByLabelText('6 exercises')).toHaveLength(3);
    expect(screen.getAllByLabelText('17 sets')).toHaveLength(3);
  });
});

describe('LogScreen', () => {
  it('shows when, how long and how hard, and each exercise with its best set and total', async () => {
    await render(<LogScreen id={3} />);
    expect(screen.getByText('Push')).toBeTruthy();
    expect(screen.getByText('52:00')).toBeTruthy();
    expect(screen.getByText('17/24')).toBeTruthy();
    expect(screen.getByText('6,240')).toBeTruthy();
    expect(screen.getByText('~390')).toBeTruthy();
    expect(screen.getByText('Bench press')).toBeTruthy();
    expect(screen.getByText('2 sets')).toBeTruthy();
    expect(screen.getByText('80 kg × 8')).toBeTruthy();
    expect(screen.getByText('VOLUME')).toBeTruthy();
    expect(screen.getByText('1,200 kg')).toBeTruthy();
    expect(screen.getByText('80 × 8 · 80 × 7')).toBeTruthy();
    // The plank: its longest hold, all of its time, and its one set.
    expect(screen.getByText('TOTAL TIME')).toBeTruthy();
    expect(screen.getAllByText('0:50')).toHaveLength(3);
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

  it('says when deleting fails', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    deleteLog.mockRejectedValueOnce(new Error('offline'));
    await render(<LogScreen id={3} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Delete from history' }));
    const confirm = alert.mock.calls[0]?.[2]?.find((button) => button.style === 'destructive');
    await act(async () => confirm?.onPress?.());
    expect(alert).toHaveBeenLastCalledWith(
      'Not deleted',
      "We couldn't delete the workout. Check your connection and try again.",
    );
    expect(router.back).not.toHaveBeenCalled();
  });

  it('waits for the exercise library', async () => {
    jest.mocked(useExerciseLibrary).mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      isFetching: true,
      refetch: jest.fn(),
    } as never);
    await render(<LogScreen id={3} />);
    expect(screen.queryByText('Push')).toBeNull();
  });

  it('says when the workout does not exist', async () => {
    await render(<LogScreen id={99} />);
    expect(screen.getByText('Workout not found')).toBeTruthy();
  });
});
