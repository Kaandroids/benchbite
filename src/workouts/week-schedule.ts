import { isoWeekday, toIsoDate } from '@/i18n/dates';

import type { WeekSession } from './workouts';

/**
 * A workout moved from one of its days to another day of the same week, or skipped on it when
 * `toOn` is null. Days are YYYY-MM-DD on the device.
 */
export type WorkoutMove = { workoutId: number; fromOn: string; toOn: string | null };

/** A finished workout: which workout it was, and the day it started as YYYY-MM-DD. */
export type FinishedWorkout = { workoutId: number | null; startedOn: string };

export type PlannedStatus = 'done' | 'planned' | 'missed' | 'skipped';

/** A workout planned on a day, after this week's moves. */
export type PlannedWorkout = {
  session: WeekSession;
  status: PlannedStatus;
  /** The day it moved from, or null when it is on one of its own days. */
  movedFrom: string | null;
};

export type ScheduleDay = {
  date: string;
  /** 1 for Monday to 7 for Sunday. */
  weekday: number;
  workouts: PlannedWorkout[];
  /** Workouts planned on this day that moved to another day, with the day they moved to. */
  movedAway: { session: WeekSession; toOn: string }[];
  /** Finished workouts that were not planned on this day. */
  extras: number;
};

/** The days of a week from Monday, and how many of its planned workouts are done. */
export type WeekSchedule = { days: ScheduleDay[]; done: number; planned: number };

/** How a day shows on the week card. */
export type DayState =
  'done' | 'partial' | 'today' | 'planned' | 'missed' | 'skipped' | 'movedAway' | 'extra' | 'rest';

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

type Entry = { session: WeekSession; movedFrom: string | null; skipped: boolean };

/**
 * The week of `today` from the plan's sessions, this week's moves and the workouts finished this
 * week (ADR 0028). A planned workout is done when a workout of it started on its day; the other
 * finished workouts are extras. Moves that no longer fit the plan, such as from a day the
 * workout is no longer on, are ignored.
 */
export function weekSchedule(
  sessions: readonly WeekSession[],
  moves: readonly WorkoutMove[],
  finished: readonly FinishedWorkout[],
  today: Date,
): WeekSchedule {
  const monday = addDays(today, 1 - isoWeekday(today));
  const dates = Array.from({ length: 7 }, (_, index) => toIsoDate(addDays(monday, index)));
  const todayOn = toIsoDate(today);
  const moveOf = new Map(moves.map((move) => [`${move.workoutId}|${move.fromOn}`, move]));

  const entries: Entry[][] = dates.map(() => []);
  const movedAway: ScheduleDay['movedAway'][] = dates.map(() => []);
  const moving: { session: WeekSession; from: number; to: number }[] = [];
  dates.forEach((date, index) => {
    for (const session of sessions.filter((item) => item.weekday === index + 1)) {
      const move = moveOf.get(`${session.workoutId}|${date}`);
      const to = move?.toOn ? dates.indexOf(move.toOn) : -1;
      if (move && move.toOn === null) {
        entries[index]!.push({ session, movedFrom: null, skipped: true });
      } else if (move && to >= 0 && to !== index) {
        moving.push({ session, from: index, to });
      } else {
        entries[index]!.push({ session, movedFrom: null, skipped: false });
      }
    }
  });
  // A move to a day the workout is already on no longer fits, so the workout stays where it was.
  for (const { session, from, to } of moving) {
    if (entries[to]!.some((entry) => entry.session.workoutId === session.workoutId)) {
      entries[from]!.push({ session, movedFrom: null, skipped: false });
    } else {
      entries[to]!.push({ session, movedFrom: dates[from]!, skipped: false });
      movedAway[from]!.push({ session, toOn: dates[to]! });
    }
  }

  let done = 0;
  let planned = 0;
  const days = dates.map((date, index): ScheduleDay => {
    const logs = finished.filter((log) => log.startedOn === date).map((log) => log.workoutId);
    const workouts = entries[index]!.map(({ session, movedFrom, skipped }): PlannedWorkout => {
      const log = logs.indexOf(session.workoutId);
      if (log >= 0) {
        logs.splice(log, 1);
      }
      const status: PlannedStatus =
        log >= 0 ? 'done' : skipped ? 'skipped' : date < todayOn ? 'missed' : 'planned';
      return { session, status, movedFrom };
    });
    done += workouts.filter((workout) => workout.status === 'done').length;
    planned += workouts.length;
    return {
      date,
      weekday: index + 1,
      workouts,
      movedAway: movedAway[index]!,
      extras: logs.length,
    };
  });
  return { days, done, planned };
}

/** How a day shows on the week card, as seen on `today` as YYYY-MM-DD. */
export function dayState(day: ScheduleDay, today: string): DayState {
  const { workouts } = day;
  if (workouts.length === 0) {
    return day.extras > 0 ? 'extra' : day.movedAway.length > 0 ? 'movedAway' : 'rest';
  }
  const done = workouts.filter((workout) => workout.status === 'done').length;
  if (done === workouts.length) {
    return 'done';
  }
  if (done > 0) {
    return 'partial';
  }
  if (workouts.every((workout) => workout.status === 'skipped')) {
    return 'skipped';
  }
  if (day.date === today) {
    return 'today';
  }
  return workouts.some((workout) => workout.status === 'missed') ? 'missed' : 'planned';
}

/**
 * The next day after `today` with workouts still planned, in this week after its moves and after
 * it on the plan's weekdays, and how many days away it is; null without any.
 */
export function nextWorkouts(
  schedule: WeekSchedule,
  sessions: readonly WeekSession[],
  today: Date,
): { inDays: number; sessions: WeekSession[] } | null {
  const weekday = isoWeekday(today);
  for (const day of schedule.days.slice(weekday)) {
    const ahead = day.workouts.filter((workout) => workout.status === 'planned');
    if (ahead.length > 0) {
      return { inDays: day.weekday - weekday, sessions: ahead.map((workout) => workout.session) };
    }
  }
  for (let next = 1; next <= 7; next++) {
    const ahead = sessions.filter((session) => session.weekday === next);
    if (ahead.length > 0) {
      return { inDays: 7 - weekday + next, sessions: ahead };
    }
  }
  return null;
}
