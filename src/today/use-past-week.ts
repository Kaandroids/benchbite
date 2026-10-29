import { useWeekLogs } from '@/history/history';
import { useWeekNutrition } from '@/nutrition/day-nutrition';
import { useWeekStreak } from '@/streak/use-streak';
import { useWeekSchedule } from '@/week/use-week-schedule';

/**
 * What a past week shows (ADR 0046): its schedule, how its days counted for the streak, its
 * workouts and its days' meals, with the queries they wait for. Its own queries load only while
 * `enabled`; the schedule's are this week's while `week` is in it.
 */
export function usePastWeek(today: Date, week: Date, enabled: boolean) {
  const { schedule, queries: scheduleQueries } = useWeekSchedule(today, week);
  const streakDays = useWeekStreak(today, week, enabled);
  const logs = useWeekLogs(week, enabled);
  const nutrition = useWeekNutrition(today, week, enabled);
  return {
    schedule,
    streakDays: streakDays.data,
    logs: logs.data ?? [],
    nutrition: nutrition.data ?? [],
    queries: [...scheduleQueries, streakDays, logs, nutrition],
  };
}

export type PastWeekData = ReturnType<typeof usePastWeek>;
