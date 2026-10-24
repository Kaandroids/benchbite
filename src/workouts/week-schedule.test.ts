import type { WeekSession } from './workouts';
import { dayState, nextWorkouts, weekSchedule, type WorkoutMove } from './week-schedule';

const session = (workoutId: number, weekday: number): WeekSession => ({
  workoutId,
  weekday,
  name: `Workout ${workoutId}`,
  type: null,
  exercises: [],
  estimatedMinutes: 45,
});

// Push (1) on Monday and Thursday, Pull (2) on Tuesday, Cardio (3) on Thursday and Saturday.
const SESSIONS = [session(1, 1), session(2, 2), session(1, 4), session(3, 4), session(3, 6)];

// Wednesday, October 21; the week runs from Monday 19 to Sunday 25.
const WEDNESDAY = new Date(2026, 9, 21, 9, 0);

const summary = (schedule: ReturnType<typeof weekSchedule>) =>
  schedule.days.map((day) => ({
    date: day.date,
    workouts: day.workouts.map(
      (workout) =>
        `${workout.session.workoutId}:${workout.status}` +
        (workout.movedFrom ? `<${workout.movedFrom}` : ''),
    ),
    movedAway: day.movedAway.map((away) => `${away.session.workoutId}>${away.toOn}`),
    extras: day.extras,
  }));

describe('weekSchedule', () => {
  it('lays out the plan from Monday, with the workouts done, missed and still planned', () => {
    const schedule = weekSchedule(
      SESSIONS,
      [],
      [{ workoutId: 2, startedOn: '2026-10-20' }],
      WEDNESDAY,
    );
    expect(summary(schedule)).toEqual([
      { date: '2026-10-19', workouts: ['1:missed'], movedAway: [], extras: 0 },
      { date: '2026-10-20', workouts: ['2:done'], movedAway: [], extras: 0 },
      { date: '2026-10-21', workouts: [], movedAway: [], extras: 0 },
      { date: '2026-10-22', workouts: ['1:planned', '3:planned'], movedAway: [], extras: 0 },
      { date: '2026-10-23', workouts: [], movedAway: [], extras: 0 },
      { date: '2026-10-24', workouts: ['3:planned'], movedAway: [], extras: 0 },
      { date: '2026-10-25', workouts: [], movedAway: [], extras: 0 },
    ]);
    // Workouts are counted, not days, so the plan cannot be passed.
    expect(schedule).toMatchObject({ done: 1, planned: 5 });
  });

  it('moves a workout to another day of the week, and skips one', () => {
    const moves: WorkoutMove[] = [
      { workoutId: 1, fromOn: '2026-10-19', toOn: '2026-10-21' },
      { workoutId: 3, fromOn: '2026-10-24', toOn: null },
    ];
    const schedule = weekSchedule(
      SESSIONS,
      moves,
      [{ workoutId: 1, startedOn: '2026-10-21' }],
      WEDNESDAY,
    );
    const days = summary(schedule);
    expect(days[0]).toMatchObject({ workouts: [], movedAway: ['1>2026-10-21'] });
    expect(days[2]).toMatchObject({ workouts: ['1:done<2026-10-19'] });
    expect(days[5]).toMatchObject({ workouts: ['3:skipped'] });
    expect(schedule).toMatchObject({ done: 1, planned: 5 });
  });

  it('counts a workout not planned on its day as an extra', () => {
    const schedule = weekSchedule(
      SESSIONS,
      [],
      [
        { workoutId: 2, startedOn: '2026-10-21' },
        { workoutId: null, startedOn: '2026-10-20' },
        { workoutId: 2, startedOn: '2026-10-20' },
      ],
      WEDNESDAY,
    );
    const days = summary(schedule);
    expect(days[1]).toMatchObject({ workouts: ['2:done'], extras: 1 });
    expect(days[2]).toMatchObject({ workouts: [], extras: 1 });
    expect(schedule).toMatchObject({ done: 1, planned: 5 });
  });

  it('ignores moves that no longer fit the plan', () => {
    const moves: WorkoutMove[] = [
      // Tuesday is not one of Push's days any more.
      { workoutId: 1, fromOn: '2026-10-20', toOn: '2026-10-21' },
      // Pull would be on a day of another week.
      { workoutId: 2, fromOn: '2026-10-20', toOn: '2026-10-27' },
      // Cardio is already on Thursday.
      { workoutId: 3, fromOn: '2026-10-24', toOn: '2026-10-22' },
    ];
    expect(summary(weekSchedule(SESSIONS, moves, [], WEDNESDAY))).toEqual(
      summary(weekSchedule(SESSIONS, [], [], WEDNESDAY)),
    );
  });
});

describe('dayState', () => {
  const stateOf = (moves: WorkoutMove[], finished: { workoutId: number; startedOn: string }[]) =>
    weekSchedule(SESSIONS, moves, finished, WEDNESDAY).days.map((day) =>
      dayState(day, '2026-10-21'),
    );

  it('sums up each day for the week card', () => {
    expect(
      stateOf(
        [{ workoutId: 3, fromOn: '2026-10-24', toOn: '2026-10-21' }],
        [
          { workoutId: 1, startedOn: '2026-10-22' },
          { workoutId: 2, startedOn: '2026-10-25' },
        ],
      ),
    ).toEqual(['missed', 'missed', 'today', 'partial', 'rest', 'movedAway', 'extra']);
  });

  it('tells done, skipped and planned days apart', () => {
    expect(
      stateOf(
        [{ workoutId: 1, fromOn: '2026-10-19', toOn: null }],
        [{ workoutId: 2, startedOn: '2026-10-20' }],
      ),
    ).toEqual(['skipped', 'done', 'rest', 'planned', 'rest', 'planned', 'rest']);
  });
});

describe('nextWorkouts', () => {
  it('is the next day with workouts still planned this week', () => {
    const schedule = weekSchedule(SESSIONS, [], [], WEDNESDAY);
    expect(nextWorkouts(schedule, SESSIONS, WEDNESDAY)).toEqual({
      inDays: 1,
      sessions: [session(1, 4), session(3, 4)],
    });
  });

  it("continues on next week's plan once this week has nothing left", () => {
    const saturday = new Date(2026, 9, 24, 9, 0);
    const schedule = weekSchedule(
      SESSIONS,
      [],
      [{ workoutId: 3, startedOn: '2026-10-24' }],
      saturday,
    );
    expect(nextWorkouts(schedule, SESSIONS, saturday)).toEqual({
      inDays: 2,
      sessions: [session(1, 1)],
    });
  });

  it('is null without a plan', () => {
    expect(nextWorkouts(weekSchedule([], [], [], WEDNESDAY), [], WEDNESDAY)).toBeNull();
  });
});
