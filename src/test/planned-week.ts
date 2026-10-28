// The workouts behind a week's sessions, and the days the database plans them on, for tests of
// screens that read the week (ADR 0041), as when no day of it kept another plan.
import { addDays, fromIsoDate, toIsoDate } from '@/i18n/dates';
import type { PlannedDay } from '@/workouts/planned-week';
import { testWorkout } from '@/workouts/test-data';
import type { WeekSession, Workout } from '@/workouts/workouts';

export function workoutsOf(sessions: readonly WeekSession[]): Workout[] {
  return [...new Set(sessions.map((item) => item.workoutId))].map((id) => {
    const first = sessions.find((item) => item.workoutId === id)!;
    return testWorkout(id, {
      name: first.name,
      type: first.type,
      weekdays: sessions.filter((item) => item.workoutId === id).map((item) => item.weekday),
      estimatedMinutes: first.estimatedMinutes,
      exercises: first.exercises,
    });
  });
}

/** The days of the week from `monday`, YYYY-MM-DD, its sessions are planned on. */
export function plannedOf(sessions: readonly WeekSession[], monday: string): PlannedDay[] {
  return sessions.map((item) => ({
    day: toIsoDate(addDays(fromIsoDate(monday), item.weekday - 1)),
    workoutId: item.workoutId,
    name: item.name,
    type: item.type,
  }));
}
