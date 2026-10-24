import { useQueryClient } from '@tanstack/react-query';

import { finishedWeekKey, useFinishedThisWeek } from '@/history/history';
import { useWeekMoves, weekMovesKey } from '@/workouts/moves';
import { weekSchedule, type FinishedWorkout, type WorkoutMove } from '@/workouts/week-schedule';
import { useWeek, weekOf, WORKOUTS_KEY, type Workout } from '@/workouts/workouts';

/**
 * The week of `today` after its moves, with the workouts finished in it (ADR 0028), and the
 * queries it comes from. Until they have loaded, the missing ones count as empty.
 */
export function useWeekSchedule(today: Date) {
  const plan = useWeek();
  const moves = useWeekMoves(today);
  const finished = useFinishedThisWeek(today);
  const schedule = weekSchedule(
    plan.data?.sessions ?? [],
    moves.data ?? [],
    finished.data ?? [],
    today,
  );
  return { schedule, plan, moves, finished };
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
    const moves = queryClient.getQueryData<WorkoutMove[]>(weekMovesKey(today));
    const finished = queryClient.getQueryData<FinishedWorkout[]>(finishedWeekKey(today));
    if (!workouts || !moves || !finished) {
      return undefined;
    }
    return weekSchedule(weekOf(workouts).sessions, moves, finished, today);
  };
}
