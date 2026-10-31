import { router } from 'expo-router';

import { useFinishedInWeek } from '@/history/history';
import { useDayEntries, type MealEntry } from '@/nutrition/meals';
import { useNutritionTargets, type NutritionTargets } from '@/nutrition/targets';
import { useDisplayName } from '@/profile/display-name';
import { NO_STREAK, type StreakBreak } from '@/streak/streak';
import { useAnswerBreak, useStreak, useStreakStart } from '@/streak/use-streak';
import { act, fireEvent, render, screen } from '@/test/render';
import { plannedOf, workoutsOf } from '@/test/planned-week';
import { useMoveWorkout, useUndoMove, useWeekMoves } from '@/workouts/moves';
import type { FinishedWorkout, WorkoutMove } from '@/workouts/week-schedule';
import { usePlannedWeek } from '@/workouts/planned-week';
import { useWeek, useWorkouts, type WeekSession } from '@/workouts/workouts';

import { greetingOf } from './greeting';
import { TodayScreen } from './today-screen';

jest.mock('@/workouts/workouts', () => ({
  ...jest.requireActual('@/workouts/workouts'),
  useWeek: jest.fn(),
  useWorkouts: jest.fn(),
}));
jest.mock('@/workouts/planned-week', () => ({
  ...jest.requireActual('@/workouts/planned-week'),
  usePlannedWeek: jest.fn(),
}));
jest.mock('@/history/history', () => ({ useFinishedInWeek: jest.fn() }));
jest.mock('@/workouts/moves', () => ({
  useWeekMoves: jest.fn(),
  useMoveWorkout: jest.fn(),
  useUndoMove: jest.fn(),
}));
jest.mock('@/nutrition/targets', () => ({ useNutritionTargets: jest.fn() }));
jest.mock('@/nutrition/meals', () => ({
  ...jest.requireActual('@/nutrition/meals'),
  useDayEntries: jest.fn(),
}));
jest.mock('@/profile/display-name', () => ({ useDisplayName: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: (_column: string, ids: string[]) =>
          Promise.resolve({
            data: ids.map((id) => ({ id, name: `Name of ${id}`, exercise_translations: [] })),
          }),
      }),
    }),
  },
}));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    Link: () => null,
    router: { push: jest.fn(), navigate: jest.fn() },
    // Runs once on mount, as the screen comes into focus.
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
    useScrollToTop: jest.fn(),
  };
});
jest.mock('@/streak/use-streak', () => ({
  useStreak: jest.fn(),
  useAnswerBreak: jest.fn(),
  useStreakStart: jest.fn(),
}));
// A past week loads its own data, tested with it.
jest.mock('./use-past-week', () => ({
  usePastWeek: (_today: Date, week: Date) => ({ week, queries: [] }),
}));
jest.mock('./past-week', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PastWeek: ({ data, onNext }: { data: { week: Date }; onNext: () => void }) => (
      <Text onPress={onNext}>{`Week of ${data.week.toDateString()}`}</Text>
    ),
  };
});

type Query<T> = {
  data?: T;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: jest.Mock;
};

const loaded = <T,>(data: T): Query<T> => ({
  data,
  isPending: false,
  isError: false,
  isFetching: false,
  refetch: jest.fn(),
});
const pending = <T,>(): Query<T> => ({
  isPending: true,
  isError: false,
  isFetching: true,
  refetch: jest.fn(),
});
const failed = <T,>(): Query<T> => ({
  isPending: false,
  isError: true,
  isFetching: false,
  refetch: jest.fn(),
});

const exercise = (exerciseId: string) => ({
  exerciseId,
  primaryMuscles: [],
  imagePath: null,
  sets: 3,
  target: { reps: { min: 8, max: 12 } },
  restSeconds: 90,
});

const session = (weekday: number, type: WeekSession['type'], exerciseCount = 0): WeekSession => ({
  workoutId: weekday,
  weekday,
  name: null,
  type,
  exercises: Array.from({ length: exerciseCount }, (_, index) => exercise(`exercise-${index}`)),
  estimatedMinutes: 45,
});

const TARGETS: NutritionTargets = { calories: 2200, proteinG: 150, carbsG: 250, fatG: 70 };
// Monday, Wednesday and Friday.
type Plan = { sessions: WeekSession[] };

const PLAN: Plan = { sessions: [session(1, 'push'), session(3, 'pull', 6), session(5, 'legs')] };

// A Wednesday.
const WEDNESDAY = new Date(2026, 9, 21, 9, 0);
const THURSDAY = new Date(2026, 9, 22, 9, 0);

// The sessions of the test week use their weekday as the workout's id.
const finishedOn = (...dates: string[]): FinishedWorkout[] =>
  dates.map((date) => ({ workoutId: new Date(`${date}T00:00`).getDay() || 7, startedOn: date }));

const answer = jest.fn();

/** A missed day that only its meals kept from counting. */
const noMeals = (day: string) => ({
  day,
  workouts: [],
  eaten: 0,
  target: 2000,
  caloriesCount: false,
});

/** The streak with a break to answer, or none, of a user who started on `startedOn`. */
function mockStreak(streakBreak: StreakBreak | null, startedOn = '2026-10-05') {
  jest.mocked(useStreakStart).mockReturnValue({ data: startedOn } as never);
  jest.mocked(useStreak).mockReturnValue({
    streak: NO_STREAK,
    streakBreak,
    failed: false,
    retry: jest.fn(),
  } as never);
  jest
    .mocked(useAnswerBreak)
    .mockReturnValue({ mutate: answer, isPending: false, isError: false } as never);
}

const move = jest.fn();
const undo = jest.fn();

function mockData({
  plan = loaded<Plan | null>(PLAN),
  targets = loaded<NutritionTargets | null>(TARGETS),
  finished = loaded<FinishedWorkout[]>([]),
  moves = loaded<WorkoutMove[]>([]),
  moving = { isError: false, isPending: false, error: null as unknown } as {
    isError: boolean;
    isPending: boolean;
    error: unknown;
    variables?: WorkoutMove;
  },
  undoing = { isError: false, isPending: false },
  name = null,
  eaten = loaded<MealEntry[]>([]),
}: {
  plan?: Query<Plan | null>;
  targets?: Query<NutritionTargets | null>;
  finished?: Query<FinishedWorkout[]>;
  moves?: Query<WorkoutMove[]>;
  moving?: { isError: boolean; isPending: boolean; error: unknown; variables?: WorkoutMove };
  undoing?: { isError: boolean; isPending: boolean };
  name?: string | null;
  eaten?: Query<MealEntry[]>;
} = {}) {
  jest.mocked(useDisplayName).mockReturnValue({ data: name } as never);
  jest.mocked(useMoveWorkout).mockReturnValue({ mutate: move, ...moving } as never);
  jest.mocked(useUndoMove).mockReturnValue({ mutate: undo, ...undoing } as never);
  jest.mocked(useFinishedInWeek).mockReturnValue(finished as never);
  jest.mocked(useWeekMoves).mockReturnValue(moves as never);
  jest.mocked(useWeek).mockReturnValue(plan as never);
  const sessions = plan.data?.sessions ?? [];
  jest.mocked(useWorkouts).mockReturnValue(loaded(workoutsOf(sessions)) as never);
  jest
    .mocked(usePlannedWeek)
    .mockReturnValue(
      (plan.isPending ? pending() : loaded(plannedOf(sessions, '2026-10-19'))) as never,
    );
  jest.mocked(useNutritionTargets).mockReturnValue(targets as never);
  jest.mocked(useDayEntries).mockReturnValue(eaten as never);
  return { plan, targets, eaten };
}

describe('TodayScreen', () => {
  beforeEach(() => {
    mockStreak(null);
    jest.clearAllMocks();
    jest.useFakeTimers({ now: WEDNESDAY, advanceTimers: true });
  });
  afterEach(() => jest.useRealTimers());

  it('shows the date and the streak once loaded, only the greeting while loading', async () => {
    mockData({ targets: pending() });
    await render(<TodayScreen />);
    expect(screen.getByText('Good morning')).toBeTruthy();
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByText('Wednesday, October 21')).toBeNull();
    expect(screen.queryByText('Your daily target')).toBeNull();
    mockData();
    await screen.rerender(<TodayScreen />);
    expect(screen.getByText('Wednesday, October 21')).toBeTruthy();
    // Streaks are not recorded yet, so every user has none.
    expect(screen.getByLabelText('0-day streak')).toBeTruthy();
  });

  it('shows an error and loads only what failed again', async () => {
    const { plan, targets } = mockData({ targets: failed() });
    await render(<TodayScreen />);
    expect(screen.getByText("Today couldn't load")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(targets.refetch).toHaveBeenCalled();
    expect(plan.refetch).not.toHaveBeenCalled();
  });

  it('greets the user for the time of day', async () => {
    mockData();
    await render(<TodayScreen />);
    expect(screen.getByText('Good morning')).toBeTruthy();
    expect(greetingOf(new Date(2026, 9, 21, 14, 0))).toBe('afternoon');
    expect(greetingOf(new Date(2026, 9, 21, 23, 0))).toBe('evening');
    expect(greetingOf(new Date(2026, 9, 21, 3, 0))).toBe('evening');
  });

  it('greets the user by the name they gave', async () => {
    mockData({ name: 'Kaan' });
    await render(<TodayScreen />);
    expect(screen.getByRole('header', { name: 'Good morning, Kaan' })).toBeTruthy();
  });

  it('highlights today and marks the workouts finished in the week', async () => {
    mockData({ finished: loaded(finishedOn('2026-10-19')) });
    await render(<TodayScreen />);
    expect(screen.getByText('1 of 3 workouts this week')).toBeTruthy();
    expect(screen.getByLabelText('Mon 19, Push, done')).toBeTruthy();
    expect(screen.getByLabelText('Wed 21, Pull, planned').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByLabelText('Fri 23, Legs, planned')).toBeTruthy();
    expect(screen.getByLabelText('Sun 25')).toBeTruthy();
  });

  it("shows today's workout with its size, leaving the exercises to the workout", async () => {
    mockData();
    await render(<TodayScreen />);
    expect(screen.getByText("Today's workout")).toBeTruthy();
    expect(screen.getByText('Pull')).toBeTruthy();
    expect(screen.getByText('6 exercises · about 45 min')).toBeTruthy();
    expect(screen.queryByText('Name of exercise-0')).toBeNull();
  });

  it("opens today's workout with its round button", async () => {
    mockData();
    await render(<TodayScreen />);
    await fireEvent.press(screen.getByRole('button', { name: "Open today's workout" }));
    // The sessions of the test week use their weekday as the workout's id.
    expect(router.push).toHaveBeenCalledWith({ pathname: '/workout/[id]', params: { id: '3' } });
  });

  it("says today's workout has no exercises yet, and opens it", async () => {
    mockData({ plan: loaded<Plan | null>({ sessions: [session(3, 'pull')] }) });
    await render(<TodayScreen />);
    expect(screen.getByText('Pull')).toBeTruthy();
    expect(screen.getByText('No exercises yet')).toBeTruthy();
    expect(screen.queryByText(/about 45 min/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: "Open today's workout" }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/workout/[id]', params: { id: '3' } });
  });

  it('shows the next workout on a rest day', async () => {
    jest.setSystemTime(THURSDAY);
    mockData();
    await render(<TodayScreen />);
    expect(screen.getByText('Rest day · next tomorrow')).toBeTruthy();
    expect(screen.getByText('Legs')).toBeTruthy();
    expect(screen.getByText('No exercises yet')).toBeTruthy();
  });

  it('opens the next workout from the rest day card, with its button or the whole card', async () => {
    jest.setSystemTime(THURSDAY);
    mockData();
    await render(<TodayScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Open the next workout' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/workout/[id]', params: { id: '5' } });
    jest.mocked(router.push).mockClear();
    await fireEvent.press(screen.getByText('Rest day · next tomorrow'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/workout/[id]', params: { id: '5' } });
  });

  it('names several next workouts with their size together, opening the first', async () => {
    jest.setSystemTime(THURSDAY);
    mockData({
      plan: loaded<Plan | null>({
        sessions: [session(6, 'push', 4), { ...session(6, 'pull', 2), workoutId: 60 }],
      }),
    });
    await render(<TodayScreen />);
    expect(screen.getByText('Rest day · next on Saturday')).toBeTruthy();
    expect(screen.getByText('Push, Pull')).toBeTruthy();
    expect(screen.getByText('2 workouts · about 90 min')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Open the next workout' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/workout/[id]', params: { id: '6' } });
  });

  it('leaves the time of a next workout without exercises out of their size', async () => {
    jest.setSystemTime(THURSDAY);
    mockData({
      plan: loaded<Plan | null>({
        sessions: [session(6, 'push', 4), { ...session(6, 'pull'), workoutId: 60 }],
      }),
    });
    await render(<TodayScreen />);
    expect(screen.getByText('Push, Pull')).toBeTruthy();
    expect(screen.getByText('2 workouts · about 45 min')).toBeTruthy();
  });

  it("shows the next workout once today's is done", async () => {
    mockData({ finished: loaded(finishedOn('2026-10-19', '2026-10-21')) });
    await render(<TodayScreen />);
    expect(screen.queryByText("Today's workout")).toBeNull();
    expect(screen.getByText('Done for today · next on Friday')).toBeTruthy();
    expect(screen.getByText('Legs')).toBeTruthy();
  });

  it('names the same weekday when the only workout of the week is done', async () => {
    mockData({
      plan: loaded<Plan | null>({ sessions: [session(3, 'pull')] }),
      finished: loaded(finishedOn('2026-10-21')),
    });
    await render(<TodayScreen />);
    expect(screen.getByText('Done for today · next on Wednesday')).toBeTruthy();
    expect(screen.getByText('Pull')).toBeTruthy();
  });

  it('shows a workout moved to today, and the moves on the week', async () => {
    jest.setSystemTime(THURSDAY);
    mockData({
      moves: loaded<WorkoutMove[]>([{ workoutId: 1, fromOn: '2026-10-19', toOn: '2026-10-22' }]),
    });
    await render(<TodayScreen />);
    expect(screen.getByText("Today's workout")).toBeTruthy();
    expect(screen.getByText('Push')).toBeTruthy();
    expect(screen.getByText('Moved from Monday')).toBeTruthy();
    expect(screen.getByLabelText('Mon 19, Push, moved to Thursday')).toBeTruthy();
  });

  it("lists today's workouts when there are several, each done or to open", async () => {
    mockData({
      plan: loaded<Plan | null>({
        sessions: [session(3, 'pull', 6), { ...session(3, 'legs'), workoutId: 30 }],
      }),
      finished: loaded<FinishedWorkout[]>([{ workoutId: 30, startedOn: '2026-10-21' }]),
    });
    await render(<TodayScreen />);
    expect(screen.getByText("Today's workouts")).toBeTruthy();
    expect(screen.getByText('1 of 2 done')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
    await fireEvent.press(screen.getByHintText('Opens the workout'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/workout/[id]', params: { id: '3' } });
  });

  it('keeps showing what loaded when refreshing fails', async () => {
    mockData({ targets: { ...loaded<NutritionTargets | null>(TARGETS), isError: true } });
    await render(<TodayScreen />);
    expect(screen.getByText("Today's workout")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('names the weekday of a later workout', async () => {
    jest.setSystemTime(THURSDAY);
    mockData({ plan: loaded<Plan | null>({ sessions: [session(1, 'push')] }) });
    await render(<TodayScreen />);
    expect(screen.getByText('Rest day · next on Monday')).toBeTruthy();
  });

  it("shows today's meals against the daily targets", async () => {
    const meal = { calories: 640, proteinG: 42, carbsG: 70, fatG: 18 };
    mockData({
      eaten: loaded<MealEntry[]>([
        { meal: 'breakfast', ...meal },
        { meal: 'lunch', ...meal },
      ]),
    });
    await render(<TodayScreen />);
    expect(jest.mocked(useDayEntries)).toHaveBeenCalledWith('2026-10-21');
    expect(screen.getByText('920')).toBeTruthy();
    expect(screen.getByText('kcal left')).toBeTruthy();
    expect(screen.getByText('84 / 150 g')).toBeTruthy();
    expect(screen.getByText('140 / 250 g')).toBeTruthy();
    expect(screen.getByText('36 / 70 g')).toBeTruthy();
  });

  it('opens Nutrition on today from the daily targets', async () => {
    mockData();
    await render(<TodayScreen />);
    await fireEvent.press(
      screen.getByRole('button', { name: /^Your daily target: 0 of 2,200 kcal eaten, / }),
    );
    expect(router.navigate).toHaveBeenCalledWith({
      pathname: '/nutrition',
      params: { day: '2026-10-21', at: expect.any(String) },
    });
  });

  it('leaves out what the user has no data for', async () => {
    mockData({ plan: loaded<Plan | null>(null), targets: loaded<NutritionTargets | null>(null) });
    await render(<TodayScreen />);
    expect(screen.queryByText("Today's workout")).toBeNull();
    expect(screen.queryByText(/^Rest day/)).toBeNull();
    expect(screen.queryByText('Your daily target')).toBeNull();
    expect(screen.getByText('Wednesday, October 21')).toBeTruthy();
  });

  it('shows the week, the daily targets, the missed workouts and today in that order', async () => {
    mockData();
    await render(<TodayScreen />);
    const headings = screen.getAllByText(
      /^(Wednesday, October 21|Your daily target|Missed on Monday|Today's workout)$/,
    );
    expect(headings.map((node) => node.props.children)).toEqual([
      'Wednesday, October 21',
      'Your daily target',
      'Missed on Monday',
      "Today's workout",
    ]);
    expect(screen.queryByText('Weight')).toBeNull();
  });

  it('loads everything again when pulled down', async () => {
    const { plan, targets, eaten } = mockData();
    await render(<TodayScreen />);
    // The mock of RefreshControl drops its props, so the handler is taken from the scroll view.
    const [scrollView] = screen.container.queryAll((node) => node.type === 'RCTScrollView');
    await act(() => scrollView!.props.refreshControl.props.onRefresh());
    for (const query of [plan, targets, eaten]) {
      expect(query.refetch).toHaveBeenCalled();
    }
  });
});

describe('paging the week', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: WEDNESDAY, advanceTimers: true });
  });
  afterEach(() => jest.useRealTimers());

  it('has no arrows in the first week, and says it is the first', async () => {
    mockStreak(null, '2026-10-20');
    mockData();
    await render(<TodayScreen />);
    expect(screen.getByText('0 of 3 workouts this week · your first week')).toBeTruthy();
    expect(screen.queryByLabelText('Previous week')).toBeNull();
    expect(screen.queryByLabelText('Next week')).toBeNull();
  });

  it('pages back to the first week and forward to this one', async () => {
    mockStreak(null, '2026-10-07');
    mockData();
    await render(<TodayScreen />);
    expect(screen.getByLabelText('Next week')).toBeDisabled();
    await act(() => fireEvent.press(screen.getByLabelText('Previous week')));
    expect(screen.getByText(`Week of ${new Date(2026, 9, 14, 9, 0).toDateString()}`)).toBeTruthy();
    expect(screen.queryByText('Your daily target')).toBeNull();
    // The past week pages on with its own card, given a way back.
    await act(() =>
      fireEvent.press(screen.getByText(`Week of ${new Date(2026, 9, 14, 9, 0).toDateString()}`)),
    );
    expect(screen.getByText('Wednesday, October 21')).toBeTruthy();
    expect(screen.getByText('Your daily target')).toBeTruthy();
  });
});

describe('moving workouts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: WEDNESDAY, advanceTimers: true });
    mockStreak(null);
  });
  afterEach(() => jest.useRealTimers());

  it('shows one missed workout with its day and size, none yet for Push', async () => {
    mockData();
    await render(<TodayScreen />);
    expect(screen.getByText('Missed on Monday')).toBeTruthy();
    expect(screen.getByText('Push')).toBeTruthy();
    // Push has no exercises, as when an empty alternative of it is in use.
    expect(screen.getByText('No exercises yet')).toBeTruthy();
  });

  it('groups several missed workouts in one card', async () => {
    // Thursday, after Monday's Push and Wednesday's Pull were missed.
    jest.setSystemTime(THURSDAY);
    mockData();
    await render(<TodayScreen />);
    expect(screen.getByText('2 missed workouts')).toBeTruthy();
    expect(screen.getByText('Push, Pull')).toBeTruthy();
    expect(screen.getByText('Monday, Wednesday')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Catch up' })).toHaveLength(1);
  });

  it('names a workout missed on several days once', async () => {
    jest.setSystemTime(THURSDAY);
    const push = session(1, 'push');
    mockData({ plan: loaded<Plan | null>({ sessions: [push, { ...push, weekday: 3 }] }) });
    await render(<TodayScreen />);
    expect(screen.getByText('2 missed workouts')).toBeTruthy();
    // The rest day card names Push too, as the next workout.
    expect(screen.getAllByText('Push')).toHaveLength(2);
    expect(screen.queryByText('Push, Push')).toBeNull();
  });

  it('names a day with several missed workouts once', async () => {
    mockData({
      plan: loaded<Plan | null>({
        sessions: [session(1, 'push'), { ...session(1, 'legs'), workoutId: 8 }],
      }),
    });
    await render(<TodayScreen />);
    expect(screen.getByText('2 missed workouts')).toBeTruthy();
    // The rest day card names them too, as the next workouts.
    expect(screen.getAllByText('Push, Legs')).toHaveLength(2);
    expect(screen.getByText('Monday')).toBeTruthy();
  });

  it('has no missed card once the workout is done or skipped', async () => {
    mockData({ moves: loaded([{ workoutId: 1, fromOn: '2026-10-19', toOn: null }]) });
    await render(<TodayScreen />);
    expect(screen.queryByText('Missed on Monday')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Catch up' })).toBeNull();
  });

  it('moves a missed workout to a free day with one tap, today first', async () => {
    mockData();
    await render(<TodayScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Catch up' }));
    expect(screen.getByText('Missed Monday · No exercises yet')).toBeTruthy();
    // Today and the days after it, but not Friday: Push is not on it, Legs is.
    expect(
      screen
        .getAllByRole('button', { name: /^Move Push to / })
        .map((chip) => chip.props.accessibilityLabel),
    ).toEqual([
      'Move Push to Today',
      'Move Push to Thursday',
      'Move Push to Friday',
      'Move Push to Saturday',
      'Move Push to Sunday',
    ]);
    await fireEvent.press(screen.getByRole('button', { name: 'Move Push to Saturday' }));
    expect(move).toHaveBeenCalledWith({ workoutId: 1, fromOn: '2026-10-19', toOn: '2026-10-24' });
  });

  it('skips a missed workout from the sheet', async () => {
    mockData();
    await render(<TodayScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Catch up' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    expect(move).toHaveBeenCalledWith({ workoutId: 1, fromOn: '2026-10-19', toOn: null });
  });

  it('closes the sheet once every missed workout is moved or skipped', async () => {
    mockData();
    await render(<TodayScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Catch up' }));
    expect(screen.getByText('Missed Monday · No exercises yet')).toBeTruthy();
    mockData({ moves: loaded([{ workoutId: 1, fromOn: '2026-10-19', toOn: '2026-10-24' }]) });
    await screen.rerender(<TodayScreen />);
    expect(
      screen.queryByText('Pick a free day this week for each missed workout, or skip it.'),
    ).toBeNull();
  });

  it('says when the day picked is no longer free', async () => {
    mockData({ moving: { isError: true, isPending: false, error: { code: 'BB019' } } });
    await render(<TodayScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Catch up' }));
    expect(screen.getByText('That day is no longer free. Pick another one.')).toBeTruthy();
  });

  it('says when skipping failed', async () => {
    mockData({
      moving: {
        isError: true,
        isPending: false,
        error: new Error('offline'),
        variables: { workoutId: 1, fromOn: '2026-10-19', toOn: null },
      },
    });
    await render(<TodayScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Catch up' }));
    expect(
      screen.getByText("We couldn't skip the workout. Check your connection and try again."),
    ).toBeTruthy();
  });

  it('moves a workout to the day picked from the week card, today first', async () => {
    mockData();
    await render(<TodayScreen />);
    await fireEvent.press(screen.getByLabelText('Mon 19, Push, missed'));
    await fireEvent.press(screen.getByRole('button', { name: 'Move to another day' }));
    expect(screen.getByText("Move Monday's Push")).toBeTruthy();
    const days = screen.getAllByRole('radio');
    expect(days).toHaveLength(5);
    expect(days[0]).toHaveAccessibleName('Wed Today Pull');
    expect(days[0]).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Sat Oct 24 Rest day' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Move to Saturday' }));
    expect(move).toHaveBeenCalledWith(
      { workoutId: 1, fromOn: '2026-10-19', toOn: '2026-10-24' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    // The sheet closes once the move is saved.
    await act(() => move.mock.calls[0][1].onSuccess());
    expect(screen.queryByText("Move Monday's Push")).toBeNull();
  });

  it("opens a day's workouts from the week card and moves one from there", async () => {
    mockData();
    await render(<TodayScreen />);
    await fireEvent.press(screen.getByLabelText('Fri 23, Legs, planned'));
    expect(screen.getByText('Friday, October 23')).toBeTruthy();
    expect(screen.getByText('1 workout planned')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Move to another day' }));
    expect(screen.getByText("Move Friday's Legs")).toBeTruthy();
  });

  it('undoes a move until the workout is done', async () => {
    mockData({ moves: loaded([{ workoutId: 1, fromOn: '2026-10-19', toOn: '2026-10-23' }]) });
    await render(<TodayScreen />);
    await fireEvent.press(
      screen.getByLabelText('Fri 23, Legs, planned, Push, moved from Monday, planned'),
    );
    expect(screen.getByText('Moved from Monday')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Undo move' }));
    expect(undo).toHaveBeenCalledWith({ workoutId: 1, fromOn: '2026-10-19' });
  });

  it('cannot undo a move once the workout is done', async () => {
    mockData({
      moves: loaded([{ workoutId: 1, fromOn: '2026-10-19', toOn: '2026-10-21' }]),
      finished: loaded([{ workoutId: 1, startedOn: '2026-10-21' }]),
    });
    await render(<TodayScreen />);
    await fireEvent.press(screen.getByLabelText('Mon 19, Push, moved to Wednesday'));
    expect(screen.getByText('Moved to Wednesday')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Undo move' })).toBeNull();
  });

  it('does not undo a move while another move of the workout is on its day', async () => {
    mockData({
      plan: loaded<Plan | null>({
        sessions: [session(1, 'push'), { ...session(3, 'push'), workoutId: 1 }],
      }),
      moves: loaded([
        { workoutId: 1, fromOn: '2026-10-19', toOn: '2026-10-23' },
        { workoutId: 1, fromOn: '2026-10-21', toOn: '2026-10-19' },
      ]),
    });
    await render(<TodayScreen />);
    await fireEvent.press(
      screen.getByLabelText('Mon 19, Push, moved from Wednesday, missed, Push, moved to Friday'),
    );
    // Only the move onto Monday can be undone; undoing the other would push it out.
    expect(screen.getAllByRole('button', { name: 'Undo move' })).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Undo move' }));
    expect(undo).toHaveBeenCalledWith({ workoutId: 1, fromOn: '2026-10-21' });
  });

  it('closes a day once it has nothing left to show', async () => {
    mockData({ moves: loaded([{ workoutId: 1, fromOn: '2026-10-19', toOn: '2026-10-22' }]) });
    await render(<TodayScreen />);
    await fireEvent.press(screen.getByLabelText('Thu 22, Push, moved from Monday, planned'));
    expect(screen.getByText('Thursday, October 22')).toBeTruthy();
    // The move was undone.
    mockData();
    await screen.rerender(<TodayScreen />);
    expect(screen.queryByText('Thursday, October 22')).toBeNull();
  });

  it('undoes a skip', async () => {
    mockData({ moves: loaded([{ workoutId: 5, fromOn: '2026-10-23', toOn: null }]) });
    await render(<TodayScreen />);
    await fireEvent.press(screen.getByLabelText('Fri 23, Legs, skipped'));
    await fireEvent.press(screen.getByRole('button', { name: 'Undo skip' }));
    expect(undo).toHaveBeenCalledWith({ workoutId: 5, fromOn: '2026-10-23' });
  });

  it('asks to answer a break of the streak, and says how a freeze kept it', async () => {
    mockData({});
    mockStreak({
      days: [noMeals('2026-10-20')],
      freezes: 3,
      savedCount: 6,
    });
    await render(<TodayScreen />);
    expect(screen.getByText('Your streak broke')).toBeTruthy();
    expect(screen.getByText("Tuesday, October 20 didn't count.")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Use 1 freeze, keep 6 days' }));
    expect(answer).toHaveBeenCalledWith(
      { today: expect.any(Date), useFreezes: true },
      expect.anything(),
    );
    // The streak loads again without the break.
    mockStreak(null);
    await act(() => answer.mock.calls[0][1].onSuccess());
    expect(
      screen.getByText('Streak kept: Tuesday, October 20 is frozen. 2 freezes left.'),
    ).toBeTruthy();
  });

  it('opens a missed day to log, out of the way until the tab shows again', async () => {
    mockData({});
    mockStreak({
      days: [noMeals('2026-10-20')],
      freezes: 3,
      savedCount: 6,
    });
    await render(<TodayScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Log Tue, Oct 20' }));
    expect(router.navigate).toHaveBeenCalledWith({
      pathname: '/nutrition',
      params: { day: '2026-10-20', at: expect.any(String) },
    });
    expect(screen.queryByText('Your streak broke')).toBeNull();
  });

  it('lets a closed break wait, and asks again once another day is missed', async () => {
    mockData({});
    mockStreak({
      days: [noMeals('2026-10-19')],
      freezes: 3,
      savedCount: 6,
    });
    await render(<TodayScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Your streak broke')).toBeNull();
    await screen.rerender(<TodayScreen />);
    expect(screen.queryByText('Your streak broke')).toBeNull();

    mockStreak({
      days: [noMeals('2026-10-19'), noMeals('2026-10-20')],
      freezes: 3,
      savedCount: 7,
    });
    await screen.rerender(<TodayScreen />);
    expect(screen.getByText('Your streak broke')).toBeTruthy();
  });
});
