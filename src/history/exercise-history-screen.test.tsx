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
const placed = (weightKg: number, reps: number, at: number) => ({
  ...set(weightKg, reps),
  place: { exercise: 0, set: at },
});
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
    {
      kind: 'heaviest',
      value: 85,
      set: set(85, 7),
      logId: 2,
      achievedAt: new Date(2026, 9, 23),
      place: { exercise: 0, set: 1 },
    },
    {
      kind: 'one_rep_max',
      value: 104.8,
      set: set(85, 7),
      logId: 2,
      achievedAt: new Date(2026, 9, 23),
      place: { exercise: 0, set: 1 },
    },
    {
      kind: 'most_reps',
      value: 10,
      set: set(70, 10),
      logId: 1,
      achievedAt: new Date(2025, 9, 12),
      place: { exercise: 0, set: 0 },
    },
  ],
  progress: [
    { ...point(1, 12, 75, 1225), startedAt: new Date(2025, 9, 12, 18) },
    point(2, 23, 85, 1875),
  ],
  sessions: [
    {
      logId: 2,
      startedAt: new Date(2026, 9, 23, 18),
      name: null,
      type: 'push',
      sets: [placed(80, 8, 0), placed(85, 7, 1)],
    },
    {
      logId: 1,
      startedAt: new Date(2025, 9, 12, 18),
      name: 'Chest day',
      type: null,
      sets: [placed(70, 10, 0), placed(75, 7, 1)],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date(2026, 9, 24) });
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
    expect(screen.getByText('Oct 12, 2025')).toBeOnTheScreen();
    // The chart starts with the last three months; everything shows the year before.
    expect(screen.getByRole('radio', { name: '3M' })).toBeChecked();
    expect(screen.getByLabelText('Heaviest in 1 workout, on Oct 23: 85 kg')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'All' }));
    expect(screen.getByText('+10 kg since Oct 12, 2025')).toBeOnTheScreen();
    expect(
      screen.getByLabelText(
        'Heaviest over 2 workouts from Oct 12, 2025 to Oct 23: lowest 75 kg, highest 85 kg, latest 85 kg',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('Sessions · 2')).toBeOnTheScreen();
    expect(screen.getByText(/^Chest day/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Record: 85 × 7')).toBeOnTheScreen();
    expect(screen.getByLabelText('Record: 70 × 10')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Record: 80 × 8')).toBeNull();
  });

  it('switches what the chart shows', async () => {
    await render(<ExerciseHistoryScreen id="bench" />);
    await fireEvent.press(screen.getByRole('radio', { name: 'All' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Volume' }));
    expect(screen.getByText('+650 kg since Oct 12, 2025')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Volume' })).toBeSelected();
  });

  it('starts with everything when the last three months are empty, and says when a range is', async () => {
    jest.useFakeTimers({ now: new Date(2027, 2, 1) });
    await render(<ExerciseHistoryScreen id="bench" />);
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: '1M' }));
    expect(screen.getByText('No workouts in this time')).toBeOnTheScreen();
  });

  it('opens a workout', async () => {
    await render(<ExerciseHistoryScreen id="bench" />);
    await fireEvent.press(screen.getByText(/^Chest day/));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workout/log/[id]',
      params: { id: '1' },
    });
  });

  it('reads an exercise no longer in the library from its sets', async () => {
    jest.mocked(useExerciseLibrary).mockReturnValue(loaded([]) as never);
    const held = { weightKg: null, reps: null, seconds: 75, meters: null };
    jest.mocked(useExerciseHistory).mockReturnValue(
      loaded({
        records: [],
        progress: [{ ...point(1, 12, 0, 0), heaviestKg: null, longestSeconds: 75 }],
        sessions: [
          {
            logId: 1,
            startedAt: new Date(2026, 9, 12, 18),
            name: 'Core',
            type: null,
            sets: [{ ...held, place: { exercise: 0, set: 0 } }],
          },
        ],
      }) as never,
    );
    await render(<ExerciseHistoryScreen id="gone" />);
    expect(screen.getByRole('radio', { name: 'Longest set' })).toBeSelected();
    expect(screen.getAllByText('1:15').length).toBeGreaterThan(0);
  });

  it('says so when the exercise was never logged', async () => {
    jest
      .mocked(useExerciseHistory)
      .mockReturnValue(loaded({ records: [], progress: [], sessions: [] }) as never);
    await render(<ExerciseHistoryScreen id="bench" />);
    expect(screen.getByText('No history yet')).toBeOnTheScreen();
  });
});
