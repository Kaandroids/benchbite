import { router } from 'expo-router';

import { useExerciseLibrary } from '@/exercises/library';
import { fireEvent, render, screen } from '@/test/render';

import { useExerciseHistory, type ExerciseHistory, type ProgressPoint } from './exercise-history';
import { ExerciseHistoryScreen } from './exercise-history-screen';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/exercises/library', () => ({ useExerciseLibrary: jest.fn() }));
jest.mock('./exercise-history', () => ({
  ...jest.requireActual<typeof import('./exercise-history')>('./exercise-history'),
  useExerciseHistory: jest.fn(),
}));

const loaded = <T,>(data: T) => ({
  data,
  isPending: false,
  isError: false,
  isFetching: false,
  refetch: jest.fn(),
});

const set = (weightKg: number, reps: number) => ({ weightKg, reps, seconds: null, meters: null });
const point = (
  logId: number,
  day: number,
  heaviestKg: number,
  volumeKg: number,
): ProgressPoint => ({
  logId,
  startedAt: new Date(2026, 9, day, 18),
  heaviestKg,
  oneRepMaxKg: heaviestKg,
  volumeKg,
  mostReps: 10,
  totalReps: 20,
  longestSeconds: null,
  totalSeconds: null,
  longestMeters: null,
  bestPace: null,
});

const HISTORY: ExerciseHistory = {
  records: [
    { kind: 'heaviest', value: 85, set: set(85, 7), logId: 2, achievedAt: new Date(2026, 9, 23) },
    {
      kind: 'one_rep_max',
      value: 104.8,
      set: set(85, 7),
      logId: 2,
      achievedAt: new Date(2026, 9, 23),
    },
    { kind: 'most_reps', value: 10, set: set(70, 10), logId: 1, achievedAt: new Date(2026, 9, 12) },
  ],
  progress: [point(1, 12, 75, 1225), point(2, 23, 85, 1875)],
  sessions: [
    {
      logId: 2,
      startedAt: new Date(2026, 9, 23, 18),
      name: null,
      type: 'push',
      sets: [set(80, 8), set(85, 7)],
    },
    {
      logId: 1,
      startedAt: new Date(2026, 9, 12, 18),
      name: 'Chest day',
      type: null,
      sets: [set(70, 10), set(75, 7)],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(useExerciseLibrary)
    .mockReturnValue(
      loaded([
        { id: 'bench', name: 'Bench press', metrics: ['weight', 'reps'], imagePaths: [] },
      ]) as never,
    );
  jest.mocked(useExerciseHistory).mockReturnValue(loaded(HISTORY) as never);
});

describe('ExerciseHistoryScreen', () => {
  it('shows the records, the progress and every workout, the record sets marked', async () => {
    await render(<ExerciseHistoryScreen id="bench" />);
    expect(screen.getByText('Bench press')).toBeOnTheScreen();
    // The record, and the chart's choice.
    expect(screen.getAllByText('Heaviest')).toHaveLength(2);
    expect(screen.getByText('85 kg')).toBeOnTheScreen();
    expect(screen.getByText('Most reps')).toBeOnTheScreen();
    // The estimate says which set it comes from, and what it is.
    expect(screen.getByText('105 kg')).toBeOnTheScreen();
    expect(screen.getByText('85 × 7 · Oct 23')).toBeOnTheScreen();
    expect(screen.getByText(/^Est\. 1RM is the most you could likely lift/)).toBeOnTheScreen();
    expect(screen.getByText('+10 kg since Oct 12')).toBeOnTheScreen();
    expect(screen.getByText('Sessions · 2')).toBeOnTheScreen();
    expect(screen.getByText(/^Chest day/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Record: 85 × 7')).toBeOnTheScreen();
    expect(screen.getByLabelText('Record: 70 × 10')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Record: 80 × 8')).toBeNull();
  });

  it('switches what the chart shows', async () => {
    await render(<ExerciseHistoryScreen id="bench" />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Volume' }));
    expect(screen.getByText('+650 kg since Oct 12')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Volume' })).toBeSelected();
  });

  it('opens a workout', async () => {
    await render(<ExerciseHistoryScreen id="bench" />);
    await fireEvent.press(screen.getByText(/^Chest day/));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workout/log/[id]',
      params: { id: '1' },
    });
  });

  it('says so when the exercise was never logged', async () => {
    jest
      .mocked(useExerciseHistory)
      .mockReturnValue(loaded({ records: [], progress: [], sessions: [] }) as never);
    await render(<ExerciseHistoryScreen id="bench" />);
    expect(screen.getByText('No history yet')).toBeOnTheScreen();
  });
});
