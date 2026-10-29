import { router } from 'expo-router';

import type { LogSummary } from '@/history/history';
import { useWeekLogs } from '@/history/history';
import type { DayNutrition } from '@/nutrition/day-nutrition';
import { useWeekNutrition } from '@/nutrition/day-nutrition';
import { useWeekStreak } from '@/streak/use-streak';
import { act, fireEvent, render, screen } from '@/test/render';
import { useWeekSchedule } from '@/week/use-week-schedule';
import { weekSchedule } from '@/workouts/week-schedule';
import type { WeekSession } from '@/workouts/workouts';

import { PastWeek } from './past-week';
import { usePastWeek } from './use-past-week';

jest.mock('@/week/use-week-schedule', () => ({ useWeekSchedule: jest.fn() }));
jest.mock('@/streak/use-streak', () => ({ useWeekStreak: jest.fn() }));
jest.mock('@/history/history', () => ({
  ...jest.requireActual('@/history/history'),
  useWeekLogs: jest.fn(),
}));
jest.mock('@/nutrition/day-nutrition', () => ({
  ...jest.requireActual('@/nutrition/day-nutrition'),
  useWeekNutrition: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const TODAY = new Date(2026, 9, 21, 9, 0);
const LAST_WEEK = new Date(2026, 9, 14, 9, 0);
const TARGETS = { calories: 2000, proteinG: 150, carbsG: 200, fatG: 60 };

const session = (workoutId: number, weekday: number, type: WeekSession['type']): WeekSession => ({
  workoutId,
  weekday,
  name: null,
  type,
  exercises: [],
  estimatedMinutes: 45,
});

const log = (id: number, type: LogSummary['type'], startedAt: Date): LogSummary => ({
  id,
  workoutId: id,
  name: null,
  type,
  startedAt,
  finishedAt: new Date(startedAt.getTime() + 52 * 60_000),
  exercises: 5,
  plannedExercises: 5,
  sets: 15,
  plannedSets: 15,
  kilograms: 4820,
  estimatedKcal: null,
  plannedExerciseIds: null,
});

const day = (date: string, calories: number, targets: DayNutrition['targets'] = TARGETS) => ({
  day: date,
  eaten: { calories, proteinG: 150, carbsG: 200, fatG: 60 },
  entries: calories > 0 ? 2 : 0,
  targets,
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

const WEEK_DAYS = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];

function mockWeek({
  logs = loaded([log(1, 'push', new Date(2026, 9, 12, 18, 0))]),
  nutrition = loaded<DayNutrition[]>([
    day(WEEK_DAYS[0]!, 1800),
    day(WEEK_DAYS[1]!, 2500),
    day(WEEK_DAYS[2]!, 0),
    day('2026-10-17', 0),
    day('2026-10-18', 0),
  ]),
  streak = loaded({}),
}: {
  logs?: Query<LogSummary[]>;
  nutrition?: Query<DayNutrition[]>;
  streak?: Query<Record<string, never>>;
} = {}) {
  jest.mocked(useWeekSchedule).mockReturnValue({
    schedule: weekSchedule(
      [session(1, 1, 'push'), session(2, 4, 'pull')],
      [],
      [{ workoutId: 1, startedOn: '2026-10-12' }],
      TODAY,
      LAST_WEEK,
    ),
    plan: loaded(null),
    queries: [loaded(null)],
  } as never);
  jest.mocked(useWeekStreak).mockReturnValue(streak as never);
  jest.mocked(useWeekLogs).mockReturnValue(logs as never);
  jest.mocked(useWeekNutrition).mockReturnValue(nutrition as never);
  return { logs, nutrition, streak };
}

function LastWeek() {
  return (
    <PastWeek
      today={TODAY}
      data={usePastWeek(TODAY, LAST_WEEK, true)}
      onNext={jest.fn()}
      onBackToToday={jest.fn()}
    />
  );
}

const renderWeek = () => render(<LastWeek />);

describe('PastWeek', () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the week's workouts, each opening its log, and the ones missed", async () => {
    mockWeek();
    await renderWeek();
    expect(screen.getByText('October 12 – 18')).toBeTruthy();
    expect(screen.getByText('1 of 2')).toBeTruthy();
    expect(screen.getByText('52 min · 4,820 kg')).toBeTruthy();
    expect(screen.getByText('Thursday: Pull missed')).toBeTruthy();
    await act(() => fireEvent.press(screen.getByText('Push')));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workout/log/[id]',
      params: { id: '1' },
    });
  });

  it("shows each day's calories and macros, a day over its target and one not logged", async () => {
    mockWeek();
    await renderWeek();
    expect(screen.getByText('avg 2,150 kcal')).toBeTruthy();
    expect(
      screen.getByLabelText('Monday: 1,800 kcal, 150 g protein, 200 g carbs, 60 g fat'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        'Tuesday: 2,500 kcal, 150 g protein, 200 g carbs, 60 g fat, over the target',
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Wednesday: nothing logged')).toBeTruthy();
    expect(screen.getByText('2.5k')).toHaveStyle({ color: '#DC2626' });
  });

  it('sums the days logged up against their targets, with the average a day', async () => {
    mockWeek();
    await renderWeek();
    expect(screen.getByText('Week summary')).toBeTruthy();
    expect(screen.getByText('4,300 / 4,000 kcal')).toBeTruthy();
    expect(screen.getAllByText('avg 150 g')).toHaveLength(1);
    expect(screen.getByText('avg 200 g')).toBeTruthy();
  });

  it('has no summary without targets', async () => {
    mockWeek({ nutrition: loaded([day(WEEK_DAYS[0]!, 1800, null)]) });
    await renderWeek();
    expect(screen.getByText('avg 1,800 kcal')).toBeTruthy();
    expect(screen.queryByText('Week summary')).toBeNull();
  });

  it('says when nothing was logged or done', async () => {
    mockWeek({ logs: loaded([]), nutrition: loaded([day(WEEK_DAYS[0]!, 0)]) });
    await renderWeek();
    expect(screen.getByText('No meals logged this week')).toBeTruthy();
    expect(screen.queryByText('Week summary')).toBeNull();
  });

  it('shows a spinner in the week while it loads, and no cards', async () => {
    mockWeek({ nutrition: pending() });
    await renderWeek();
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByText('Workouts')).toBeNull();
  });

  it('loads again only what failed', async () => {
    const { logs, nutrition } = mockWeek({ logs: failed() });
    await renderWeek();
    await act(() => fireEvent.press(screen.getByText('Try again')));
    expect(logs.refetch).toHaveBeenCalled();
    expect(nutrition.refetch).not.toHaveBeenCalled();
  });
});
