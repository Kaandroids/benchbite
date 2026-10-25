import { router, usePreventRemove } from 'expo-router';
import { Alert } from 'react-native';

import { useExerciseLibrary } from '@/exercises/library';
import { act, fireEvent, render, screen } from '@/test/render';
import { useWorkouts } from '@/workouts/workouts';

import { EditLogScreen } from './edit-log-screen';
import {
  useDeleteLog,
  useEditLog,
  useLoggedSets,
  useLogSummaries,
  useLogSummary,
  useRecentLogs,
  type LogSummary,
} from './history';
import { HistoryScreen } from './history-screen';
import { LogScreen } from './log-screen';
import { RecentLogs } from './recent-logs';
import { missingFields } from './use-log-edit';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  usePreventRemove: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/exercises/library', () => ({
  ...jest.requireActual<typeof import('@/exercises/library')>('@/exercises/library'),
  useExerciseLibrary: jest.fn(),
}));
jest.mock('@/workouts/workouts', () => ({
  ...jest.requireActual<typeof import('@/workouts/workouts')>('@/workouts/workouts'),
  useWorkouts: jest.fn(),
}));
jest.mock('./history', () => ({
  ...jest.requireActual<typeof import('./history')>('./history'),
  useLogSummaries: jest.fn(),
  useLogSummary: jest.fn(),
  useRecentLogs: jest.fn(),
  useLoggedSets: jest.fn(),
  useDeleteLog: jest.fn(),
  useEditLog: jest.fn(),
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
  plannedExerciseIds: null,
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
const fetchNextPage = jest.fn();
const editLog = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: FRIDAY });
  // Two pages, the second starting within this week, which still shows as one week.
  jest.mocked(useLogSummaries).mockReturnValue({
    ...loaded({ pages: [{ logs: LOGS.slice(0, 1) }, { logs: LOGS.slice(1) }] }),
    hasNextPage: true,
    isFetchingNextPage: false,
    fetchNextPage,
  } as never);
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
  jest.mocked(useEditLog).mockReturnValue({
    mutateAsync: editLog.mockResolvedValue(undefined),
    isPending: false,
  } as never);
  jest.mocked(useExerciseLibrary).mockReturnValue(
    loaded([
      { id: 'bench', name: 'Bench press', metrics: ['weight', 'reps'], imagePaths: [] },
      { id: 'plank', name: 'Plank', metrics: ['duration'], imagePaths: [] },
      { id: 'row', name: 'Cable row', metrics: ['weight', 'reps'], imagePaths: [] },
    ]) as never,
  );
  // The workout the logs were done from; its cable row was skipped.
  jest.mocked(useWorkouts).mockReturnValue(
    loaded([
      {
        id: 1,
        exercises: [{ exerciseId: 'bench' }, { exerciseId: 'row' }, { exerciseId: 'plank' }],
      },
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
    // The last week may go on in the next page, so it has no total yet.
    expect(screen.queryByText('1 workout · 58 min')).toBeNull();
  });

  it('totals the last week once there are no more pages', async () => {
    jest.mocked(useLogSummaries).mockReturnValue({
      ...loaded({ pages: [{ logs: LOGS }] }),
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage,
    } as never);
    await render(<HistoryScreen />);
    expect(screen.getByText('1 workout · 58 min')).toBeTruthy();
  });

  it('loads the next page at the end of the list', async () => {
    await render(<HistoryScreen />);
    await fireEvent(screen.getByTestId('history-list'), 'endReached');
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('keeps the list when the next page fails, and tries it again', async () => {
    jest.mocked(useLogSummaries).mockReturnValue({
      ...loaded({ pages: [{ logs: LOGS.slice(0, 1) }, { logs: LOGS.slice(1) }] }),
      isError: true,
      isFetchNextPageError: true,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage,
    } as never);
    await render(<HistoryScreen />);
    expect(screen.getByText('This week')).toBeTruthy();
    expect(screen.getByText("We couldn't load your older workouts.")).toBeTruthy();
    // Not again on its own at the end of the list, only when asked.
    await fireEvent(screen.getByTestId('history-list'), 'endReached');
    expect(fetchNextPage).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});

describe('LogScreen', () => {
  it('shows when, how long and how hard, and each exercise with its sets, the best picked out', async () => {
    await render(<LogScreen id={3} />);
    expect(screen.getByText('Push')).toBeTruthy();
    expect(screen.getByText('52:00')).toBeTruthy();
    expect(screen.getByText('17/24')).toBeTruthy();
    expect(screen.getByText('6,240')).toBeTruthy();
    expect(screen.getByText('~390')).toBeTruthy();
    expect(screen.getByText('Bench press')).toBeTruthy();
    expect(screen.getByText('2 sets · 1,200 kg')).toBeTruthy();
    expect(screen.getByText('80 × 7')).toBeTruthy();
    expect(screen.getByLabelText('BEST SET: 80 kg × 8')).toBeTruthy();
    // Each exercise opens how to do it and its history.
    await fireEvent.press(screen.getByRole('button', { name: 'History of Bench press' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workout/exercise/history',
      params: { id: 'bench' },
    });
    expect(screen.getByRole('button', { name: 'Details of Bench press' })).toBeTruthy();
    // The plank: one hold, its time as the total.
    expect(screen.getByText('1 set · 0:50')).toBeTruthy();
    expect(screen.getByLabelText('BEST SET: 0:50')).toBeTruthy();
  });

  it('opens the workout to edit it', async () => {
    await render(<LogScreen id={3} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workout/log/edit',
      params: { id: '3' },
    });
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

describe('EditLogScreen', () => {
  const bench = (weightKg: number | null, reps: number | null) => ({
    weightKg,
    reps,
    seconds: null,
    meters: null,
  });
  const plank = (seconds: number) => ({ weightKg: null, reps: null, seconds, meters: null });

  it('shows the sets to edit and keeps the time', async () => {
    await render(<EditLogScreen id={3} />);
    expect(screen.getByText('Edit Push')).toBeTruthy();
    expect(
      screen.getByText(
        'Friday, October 23 · 6:04 PM–6:56 PM. The date, time and calories stay as they were.',
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Weight of set 1').props.value).toBe('80');
    expect(screen.getByLabelText('Reps of set 2').props.value).toBe('7');
    expect(screen.getByLabelText('Time of set 1').props.value).toBe('0:50');
  });

  it('saves changed, removed and added sets', async () => {
    await render(<EditLogScreen id={3} />);
    await fireEvent.changeText(screen.getAllByLabelText('Weight of set 1')[0]!, '82.5');
    await fireEvent(screen.getAllByLabelText('Weight of set 1')[0]!, 'endEditing');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Remove set 2' })[0]!);
    // The plank gets a second hold like its first.
    await fireEvent.press(screen.getAllByRole('button', { name: '+ Add set' })[2]!);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(editLog).toHaveBeenCalledWith({
      id: 3,
      exercises: [
        { place: 0, exerciseId: 'bench', sets: [bench(82.5, 8)] },
        { place: 1, exerciseId: 'row', sets: [] },
        { place: 2, exerciseId: 'plank', sets: [plank(50), plank(50)] },
      ],
    });
    expect(router.back).toHaveBeenCalled();
  });

  it('adds sets to an exercise that was skipped', async () => {
    await render(<EditLogScreen id={3} />);
    expect(screen.getByText('Cable row')).toBeTruthy();
    expect(screen.getByText('Skipped')).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: '+ Add set' })[1]!);
    expect(screen.queryByText('Skipped')).toBeNull();
    // Bench press has sets 1 and 2; the row's new set is the next "set 1".
    const weight = screen.getAllByLabelText('Weight of set 1')[1]!;
    const reps = screen.getAllByLabelText('Reps of set 1')[1]!;
    await fireEvent.changeText(weight, '50');
    await fireEvent.changeText(reps, '10');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(editLog).toHaveBeenCalledWith({
      id: 3,
      exercises: [
        { place: 0, exerciseId: 'bench', sets: [bench(80, 8), bench(80, 7)] },
        { place: 1, exerciseId: 'row', sets: [bench(50, 10)] },
        { place: 2, exerciseId: 'plank', sets: [plank(50)] },
      ],
    });
  });

  it('shows only what was logged once the workout is gone, keeping the places', async () => {
    jest.mocked(useWorkouts).mockReturnValue(loaded([]) as never);
    await render(<EditLogScreen id={3} />);
    expect(screen.queryByText('Cable row')).toBeNull();
    expect(screen.getByText('Plank')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(editLog).toHaveBeenCalledWith({
      id: 3,
      exercises: [
        { place: 0, exerciseId: 'bench', sets: [bench(80, 8), bench(80, 7)] },
        { place: 2, exerciseId: 'plank', sets: [plank(50)] },
      ],
    });
  });

  it('names the skipped exercises from what the workout had then, however it changed since', async () => {
    jest
      .mocked(useLogSummary)
      .mockReturnValue(
        loaded({ ...LOGS[0]!, plannedExerciseIds: ['bench', 'row', 'plank'] }) as never,
      );
    // The workout was reordered and its row taken out since.
    jest
      .mocked(useWorkouts)
      .mockReturnValue(
        loaded([{ id: 1, exercises: [{ exerciseId: 'plank' }, { exerciseId: 'bench' }] }]) as never,
      );
    await render(<EditLogScreen id={3} />);
    expect(screen.getByText('Cable row')).toBeTruthy();
    expect(screen.getByText('Skipped')).toBeTruthy();
  });

  it('leaves out exercises added to the workout after it was done', async () => {
    jest
      .mocked(useLogSummary)
      .mockReturnValue(loaded({ ...LOGS[0]!, plannedExercises: 3 }) as never);
    jest.mocked(useWorkouts).mockReturnValue(
      loaded([
        {
          id: 1,
          exercises: [
            { exerciseId: 'bench' },
            { exerciseId: 'row' },
            { exerciseId: 'plank' },
            { exerciseId: 'curl' },
          ],
        },
      ]) as never,
    );
    await render(<EditLogScreen id={3} />);
    expect(screen.getByText('Cable row')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '+ Add set' })).toHaveLength(3);
  });

  it('marks what is missing instead of saving', async () => {
    await render(<EditLogScreen id={3} />);
    // Cleared with the keyboard still up.
    await fireEvent.changeText(screen.getByLabelText('Reps of set 2'), '');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(editLog).not.toHaveBeenCalled();
    expect(screen.getByText('Fill in the marked values to save.')).toBeTruthy();
    expect(screen.getByLabelText('Reps of set 2').props['aria-invalid']).toBe(true);
    expect(screen.getByLabelText('Weight of set 2').props['aria-invalid']).toBe(false);
  });

  it('keeps at least one set', async () => {
    await render(<EditLogScreen id={3} />);
    // Each removal numbers the sets after it again, so every set is set 1 in the end.
    for (let removed = 0; removed < 3; removed++) {
      await fireEvent.press(screen.getAllByRole('button', { name: 'Remove set 1' })[0]!);
    }
    expect(screen.getByText('Keep at least one set, or delete the workout instead.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('adds sets up to as many as a log can keep', async () => {
    await render(<EditLogScreen id={3} />);
    // The bench press has 2 sets.
    for (let added = 0; added < 18; added++) {
      await fireEvent.press(screen.getAllByRole('button', { name: '+ Add set' })[0]!);
    }
    expect(screen.getAllByLabelText('Reps of set 20')).toHaveLength(1);
    // Only the cable row and the plank can still get sets.
    expect(screen.getAllByRole('button', { name: '+ Add set' })).toHaveLength(2);
  });

  it('asks before leaving with changes', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const prevents = () => jest.mocked(usePreventRemove).mock.lastCall?.[0];
    await render(<EditLogScreen id={3} />);
    expect(prevents()).toBe(false);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Remove set 1' })[0]!);
    expect(prevents()).toBe(true);

    // Leaving, by the close button or the system's back, is held until the user decides.
    const repeat = jest.fn();
    await act(async () =>
      jest.mocked(usePreventRemove).mock.lastCall?.[1]?.({ data: { action: {} }, repeat } as never),
    );
    expect(alert).toHaveBeenCalledWith(
      'Discard your changes?',
      'Your changes to this workout are not saved.',
      expect.any(Array),
    );
    const discard = alert.mock.calls[0]?.[2]?.find((button) => button.style === 'destructive');
    await act(async () => discard?.onPress?.());
    expect(prevents()).toBe(false);
    expect(repeat).toHaveBeenCalled();
    expect(editLog).not.toHaveBeenCalled();
  });

  it('says when saving fails and stays open', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    editLog.mockRejectedValueOnce(new Error('offline'));
    await render(<EditLogScreen id={3} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(alert).toHaveBeenCalledWith(
      'Not saved',
      "We couldn't save your changes. Check your connection and try again.",
    );
    expect(router.back).not.toHaveBeenCalled();
  });

  it('says when the workout does not exist', async () => {
    await render(<EditLogScreen id={99} />);
    expect(screen.getByText('Workout not found')).toBeTruthy();
  });
});

describe('missingFields', () => {
  const values = { weightKg: null, reps: null, seconds: null, meters: null };

  it('needs the reps, and a weight unless it is added to the body', () => {
    const lifted = { fields: ['weightKg', 'reps'] as const, timed: false, addedWeight: false };
    expect(missingFields(values, { ...lifted, fields: [...lifted.fields] })).toEqual([
      'weightKg',
      'reps',
    ]);
    expect(
      missingFields(
        { ...values, reps: 10 },
        { ...lifted, fields: [...lifted.fields], addedWeight: true },
      ),
    ).toEqual([]);
  });

  it('needs a time or a distance', () => {
    const kind = {
      fields: ['meters' as const, 'seconds' as const],
      timed: true,
      addedWeight: false,
    };
    expect(missingFields(values, kind)).toEqual(['meters', 'seconds']);
    expect(missingFields({ ...values, meters: 2000 }, kind)).toEqual([]);
  });
});
