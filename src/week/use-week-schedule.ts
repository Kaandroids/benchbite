import { useQueryClient } from '@tanstack/react-query';

import { finishedWeekKey, useFinishedInWeek } from '@/history/history';
import { useWeekMoves, weekMovesKey } from '@/workouts/moves';
import {
  plannedSessions,
  plannedWeekKey,
  usePlannedWeek,
  type PlannedDay,
} from '@/workouts/planned-week';
import { weekSchedule, type FinishedWorkout, type WorkoutMove } from '@/workouts/week-schedule';
import { useWeek, useWorkouts, WORKOUTS_KEY, type Workout } from '@/workouts/workouts';

/**
 * The week of `week`, by default the week of `today`, after its moves, with the workouts finished
 * in it (ADR 0028), and the queries it waits for. Each day is planned as the database says: past
 * days as they kept their plan, today and later by the plan (ADR 0041). Until the queries have
 * loaded, the missing ones count as empty.
 */
export function useWeekSchedule(today: Date, week: Date = today) {
  const plan = useWeek();
  const workouts = useWorkouts();
  const planned = usePlannedWeek(today, week);
  const moves = useWeekMoves(week);
  const finished = useFinishedInWeek(week);
  const schedule = weekSchedule(
    plannedSessions(planned.data ?? [], workouts.data ?? []),
    moves.data ?? [],
    finished.data ?? [],
    today,
    week,
  );
  // Everything the week waits for, so that callers need not list it again. The plan and the
  // workouts are one query.
  const queries = [plan, planned, moves, finished];
  return { schedule, plan, queries };
}

/**
 * Reads the week of a day from the queries as they are cached when it is called, so that it sees
 * a log saved a moment ago; undefined when any of them has not loaded, as offline before they ever
 * loaded.
 */
export function useCachedWeekSchedule() {
  const queryClient = useQueryClient();
  return (today: Date) => {
    const workouts = queryClient.getQueryData<Workout[]>(WORKOUTS_KEY);
    const planned = queryClient.getQueryData<PlannedDay[]>(plannedWeekKey(today));
    const moves = queryClient.getQueryData<WorkoutMove[]>(weekMovesKey(today));
    const finished = queryClient.getQueryData<FinishedWorkout[]>(finishedWeekKey(today));
    if (!workouts || !planned || !moves || !finished) {
      return undefined;
    }
    return weekSchedule(plannedSessions(planned, workouts), moves, finished, today);
  };
}
