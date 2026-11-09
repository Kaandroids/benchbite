// Workouts other apps and watches recorded, as the server keeps them (#468, ADR 0106): the list to
// show leaves out a watch's copy of a logged workout. They are shown next to Benchbite's own and
// count toward neither the streak nor the week.
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import { activityOf, type Activity } from './activities';
import { useReading } from './use-read-ask';

export const OUTSIDE_WORKOUTS_KEY = ['outside-workouts'];

/** The most read at once: far more than a week holds, and the history shows them by the logs'. */
const MOST = 300;

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

type Row = {
  store: string | null;
  source_id: string | null;
  activity: string | null;
  started_at: string | null;
  ended_at: string | null;
  started_on: string | null;
  active_kcal: number | null;
  heart_rate_avg: number | null;
  source: string | null;
};

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

/** The workouts that started on the days from `first` to `last`, YYYY-MM-DD, latest first. */
export async function outsideWorkoutsOn(first: string, last: string) {
  const { data, error } = await supabase
    .from('outside_workout_list')
    .select('*')
    .gte('started_on', first)
    .lte('started_on', last)
    .order('started_at', { ascending: false })
    .limit(MOST);
  if (error) throw error;
  return data.flatMap(toListed);
}

/** The workouts that started since a time, or the latest ones without it, latest first. */
export async function outsideWorkoutsSince(since: Date | null) {
  let query = supabase.from('outside_workout_list').select('*');
  if (since) query = query.gte('started_at', since.toISOString());
  const { data, error } = await query.order('started_at', { ascending: false }).limit(MOST);
  if (error) throw error;
  return data.flatMap(toListed);
}

/** The workouts of the days from `first` to `last`, while other apps' workouts are read. */
export function useOutsideWorkoutsOn(first: string, last: string) {
  const reading = useReading('workouts');
  return useQuery({
    queryKey: [...OUTSIDE_WORKOUTS_KEY, 'on', first, last],
    queryFn: () => outsideWorkoutsOn(first, last),
    enabled: reading,
  });
}

/** The workouts since a time, or the latest ones, while other apps' workouts are read. */
export function useOutsideWorkoutsSince(since: Date | null, enabled = true) {
  const reading = useReading('workouts');
  return useQuery({
    queryKey: [...OUTSIDE_WORKOUTS_KEY, 'since', since?.getTime() ?? null],
    queryFn: () => outsideWorkoutsSince(since),
    enabled: reading && enabled,
  });
}
