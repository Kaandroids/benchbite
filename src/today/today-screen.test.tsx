import { router } from 'expo-router';

import { useNutritionTargets, type NutritionTargets } from '@/nutrition/targets';
import { act, fireEvent, render, screen } from '@/test/render';
import { useLatestWeight, useLogWeight, useWeightUnit } from '@/weight/weights';
import { useWeek, type WeekSession } from '@/workouts/workouts';

import { TodayScreen } from './today-screen';
import { SAVE_DELAY_MS } from './weight-card';

jest.mock('@/workouts/workouts', () => ({ useWeek: jest.fn() }));
jest.mock('@/nutrition/targets', () => ({ useNutritionTargets: jest.fn() }));
jest.mock('@/weight/weights', () => ({
  useLatestWeight: jest.fn(),
  useLogWeight: jest.fn(),
  useWeightUnit: jest.fn(),
}));
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
jest.mock('expo-router', () => ({ Link: () => null, router: { push: jest.fn() } }));

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

const mutate = jest.fn();
const reset = jest.fn();

function mockData({
  plan = loaded<Plan | null>(PLAN),
  targets = loaded<NutritionTargets | null>(TARGETS),
  weight = loaded({ weightKg: 80, measuredOn: '2026-10-21' } as {
    weightKg: number;
    measuredOn: string;
  } | null),
  unit = loaded<'kg' | 'lb'>('kg'),
  log = { isError: false, isPending: false },
}: {
  plan?: Query<Plan | null>;
  targets?: Query<NutritionTargets | null>;
  weight?: Query<{ weightKg: number; measuredOn: string } | null>;
  unit?: Query<'kg' | 'lb'>;
  log?: { isError: boolean; isPending: boolean };
} = {}) {
  jest.mocked(useWeek).mockReturnValue(plan as never);
  jest.mocked(useNutritionTargets).mockReturnValue(targets as never);
  jest.mocked(useLatestWeight).mockReturnValue(weight as never);
  jest.mocked(useWeightUnit).mockReturnValue(unit as never);
  jest.mocked(useLogWeight).mockReturnValue({ mutate, reset, ...log } as never);
  return { plan, targets, weight, unit };
}

describe('TodayScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: WEDNESDAY, advanceTimers: true });
  });
  afterEach(() => jest.useRealTimers());

  it('shows the date and the streak while loading', async () => {
    mockData({ targets: pending() });
    await render(<TodayScreen />);
    expect(screen.getByText('October 21, 2026')).toBeTruthy();
    // Streaks are not recorded yet, so every user has none.
    expect(screen.getByLabelText('0-day streak')).toBeTruthy();
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByText('Your daily targets')).toBeNull();
  });

  it('shows an error and loads only what failed again', async () => {
    const { plan, targets } = mockData({ targets: failed() });
    await render(<TodayScreen />);
    expect(screen.getByText("Today couldn't load")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(targets.refetch).toHaveBeenCalled();
    expect(plan.refetch).not.toHaveBeenCalled();
  });

  it('highlights today and marks the workouts in the week', async () => {
    mockData();
    await render(<TodayScreen />);
    // No workout is finished until workouts can be logged.
    expect(screen.getByLabelText('Mon 19, workout missed')).toBeTruthy();
    expect(screen.getByLabelText('Wed 21, workout planned').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByLabelText('Fri 23, workout planned')).toBeTruthy();
    expect(screen.getByLabelText('Sun 25')).toBeTruthy();
  });

  it("shows today's workout with its first exercises", async () => {
    mockData();
    await render(<TodayScreen />);
    expect(screen.getByText("Today's workout")).toBeTruthy();
    expect(screen.getByText('Pull')).toBeTruthy();
    expect(screen.getByText('6 exercises · about 45 min')).toBeTruthy();
    expect(await screen.findByText('Name of exercise-0')).toBeTruthy();
    expect(screen.getByText('Name of exercise-3')).toBeTruthy();
    expect(screen.queryByText('Name of exercise-4')).toBeNull();
    expect(screen.getByText('+2 more')).toBeTruthy();
  });

  it("opens today's workout", async () => {
    mockData();
    await render(<TodayScreen />);
    await fireEvent.press(screen.getByHintText('Opens the workout'));
    // The sessions of the test week use their weekday as the workout's id.
    expect(router.push).toHaveBeenCalledWith({ pathname: '/workout/[id]', params: { id: '3' } });
  });

  it('shows the next workout on a rest day', async () => {
    jest.setSystemTime(THURSDAY);
    mockData();
    await render(<TodayScreen />);
    expect(screen.getByText('Rest day')).toBeTruthy();
    expect(screen.getByText('Next: tomorrow · Legs')).toBeTruthy();
  });

  it('names the weekday of a later workout', async () => {
    jest.setSystemTime(THURSDAY);
    mockData({ plan: loaded<Plan | null>({ sessions: [session(1, 'push')] }) });
    await render(<TodayScreen />);
    expect(screen.getByText('Next: Monday · Push')).toBeTruthy();
  });

  it('shows what was eaten against the daily targets, nothing until meals can be logged', async () => {
    mockData();
    await render(<TodayScreen />);
    expect(screen.getByText('0 / 2,200 kcal')).toBeTruthy();
    expect(screen.getByText('0 / 150 g')).toBeTruthy();
    expect(screen.getByText('0 / 250 g')).toBeTruthy();
    expect(screen.getByText('0 / 70 g')).toBeTruthy();
  });

  it('leaves out what the user has no data for', async () => {
    mockData({ plan: loaded<Plan | null>(null), targets: loaded<NutritionTargets | null>(null) });
    await render(<TodayScreen />);
    expect(screen.queryByText("Today's workout")).toBeNull();
    expect(screen.queryByText('Rest day')).toBeNull();
    expect(screen.queryByText('Your daily targets')).toBeNull();
    expect(screen.getByText('Weight')).toBeTruthy();
  });

  it('loads everything again when pulled down', async () => {
    const { plan, targets, weight, unit } = mockData();
    await render(<TodayScreen />);
    // The mock of RefreshControl drops its props, so the handler is taken from the scroll view.
    const [scrollView] = screen.container.queryAll((node) => node.type === 'RCTScrollView');
    await act(() => scrollView!.props.refreshControl.props.onRefresh());
    for (const query of [plan, targets, weight, unit]) {
      expect(query.refetch).toHaveBeenCalled();
    }
  });
});

describe('the weight card', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: WEDNESDAY, advanceTimers: true });
  });
  afterEach(() => jest.useRealTimers());

  const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));

  it('says when no weight is logged', async () => {
    mockData({ weight: loaded(null) });
    await render(<TodayScreen />);
    expect(screen.getByText('No weight logged yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Increase weight' })).toBeNull();
  });

  it("shows today's weight", async () => {
    mockData();
    await render(<TodayScreen />);
    expect(screen.getByText('80 kg')).toBeTruthy();
    expect(screen.getByText('Logged today')).toBeTruthy();
  });

  it('shows the day of an earlier weight, in the unit of the user', async () => {
    mockData({
      weight: loaded({ weightKg: 80, measuredOn: '2026-10-19' }),
      unit: loaded<'kg' | 'lb'>('lb'),
    });
    await render(<TodayScreen />);
    expect(screen.getByText('176.4 lb')).toBeTruthy();
    expect(screen.getByText('Logged on Oct 19, 2026')).toBeTruthy();
  });

  it('changes the weight a tenth of a kilogram per press and saves it once after the last', async () => {
    mockData({ weight: loaded({ weightKg: 80, measuredOn: '2026-10-19' }) });
    await render(<TodayScreen />);
    await press('Increase weight');
    await press('Increase weight');
    await press('Increase weight');
    await press('Decrease weight');
    expect(screen.getByText('80.2 kg')).toBeTruthy();
    expect(screen.getByText('Logged today')).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTime(SAVE_DELAY_MS));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(80.2, expect.anything());
  });

  it('shows the saved weight once it is loaded again', async () => {
    mockData();
    mutate.mockImplementation((_kg: number, { onSettled }: { onSettled: () => void }) =>
      onSettled(),
    );
    await render(<TodayScreen />);
    await press('Decrease weight');
    await act(() => jest.advanceTimersByTime(SAVE_DELAY_MS));
    // The mocked query still returns the old weight.
    expect(screen.getByText('80 kg')).toBeTruthy();
  });

  it('saves a waiting change when the screen closes', async () => {
    mockData();
    const { unmount } = await render(<TodayScreen />);
    await press('Increase weight');
    await act(() => unmount());
    expect(mutate).toHaveBeenCalledWith(80.1, expect.anything());
  });

  it('stays within the weights the database accepts', async () => {
    mockData({ weight: loaded({ weightKg: 30, measuredOn: '2026-10-21' }) });
    await render(<TodayScreen />);
    await press('Decrease weight');
    expect(screen.getByText('30 kg')).toBeTruthy();
  });

  it('says when saving failed', async () => {
    mockData({ log: { isError: true, isPending: false } });
    await render(<TodayScreen />);
    expect(
      screen.getByText("We couldn't save your weight. Check your connection and try again."),
    ).toBeTruthy();
  });
});
