// Workouts other apps and watches recorded, as the server keeps them (#468, ADR 0106): the list to
// show leaves out a watch's copy of a logged workout. They are shown next to Benchbite's own and
// count toward neither the streak nor the week.
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

import { activityOf, type Activity } from './activities';
import { OUTSIDE_WORKOUTS_KEY } from './outside-workouts-key';
import type { HealthStore, WorkoutFigures } from './types';
import { useReading } from './use-read-ask';

export { OUTSIDE_WORKOUTS_KEY };

/** The most read at once, as many as the server gives in one answer. */
const MOST = 1000;

/** A workout another app recorded, as shown. */
export type ListedOutsideWorkout = {
  /** Unique among the user's: its store and the store's id of it. */
  key: string;
  activity: Activity;
  startedAt: Date;
  endedAt: Date;
  /** The device's day it started on, YYYY-MM-DD. */
  startedOn: string;
  activeKcal: number | null;
  heartRateAvg: number | null;
  source: string | null;
};

type Row = Database['public']['Views']['outside_workout_list']['Row'];

const toListed = (row: Row): ListedOutsideWorkout[] =>
  row.store && row.source_id && row.activity && row.started_at && row.ended_at && row.started_on
    ? [
        {
          key: `${row.store}:${row.source_id}`,
          activity: activityOf(row.activity),
          startedAt: new Date(row.started_at),
          endedAt: new Date(row.ended_at),
          startedOn: row.started_on,
          activeKcal: row.active_kcal,
          heartRateAvg: row.heart_rate_avg,
          source: row.source,
        },
      ]
    : [];

const listQuery = () => supabase.from('outside_workout_list').select('*');

/** The list to show, narrowed by a filter, latest first. */
async function listed(
  narrow: (query: ReturnType<typeof listQuery>) => ReturnType<typeof listQuery>,
) {
  const { data, error } = await narrow(listQuery())
    .order('started_at', { ascending: false })
    .limit(MOST);
  if (error) throw error;
  return data.flatMap(toListed);
}

/** The workouts that started on the days from `first` to `last`, YYYY-MM-DD, latest first. */
export const outsideWorkoutsOn = (first: string, last: string) =>
  listed((query) => query.gte('started_on', first).lte('started_on', last));

/** The workouts that started since a time, or all of them without it, latest first. */
export const outsideWorkoutsSince = (since: Date | null) =>
  listed((query) => (since ? query.gte('started_at', since.toISOString()) : query));

/** The workouts of the days from `first` to `last`, while other apps' workouts are read. */
export function useOutsideWorkoutsOn(first: string, last: string) {
  const reading = useReading('workouts');
  return useQuery({
    queryKey: [...OUTSIDE_WORKOUTS_KEY, 'on', first, last],
    queryFn: () => outsideWorkoutsOn(first, last),
    enabled: reading,
    // Paging to another week keeps the last one's on screen until its own arrive.
    placeholderData: keepPreviousData,
  });
}

/**
 * The workouts since a time, or all of them, while other apps' workouts are read. As the history
 * loads older pages, the time moves back, and the ones already shown stay until the rest arrive.
 */
export function useOutsideWorkoutsSince(since: Date | null, enabled = true) {
  const reading = useReading('workouts');
  return useQuery({
    queryKey: [...OUTSIDE_WORKOUTS_KEY, 'since', since?.getTime() ?? null],
    queryFn: () => outsideWorkoutsSince(since),
    enabled: reading && enabled,
    placeholderData: keepPreviousData,
  });
}

/** The figures kept of a store's workouts that started since a time, by the store's id of each. */
export async function keptFigures(
  store: NonNullable<HealthStore>,
  since: Date,
): Promise<Map<string, WorkoutFigures>> {
  const { data, error } = await supabase
    .from('outside_workouts')
    .select('source_id, active_kcal, heart_rate_avg')
    .eq('store', store)
    .gte('started_at', since.toISOString())
    .limit(MOST);
  if (error) throw error;
  return new Map(
    data.map((row) => [
      row.source_id,
      { activeKcal: row.active_kcal, heartRateAvg: row.heart_rate_avg },
    ]),
  );
}
