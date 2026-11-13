// Workouts other apps and watches recorded, as the server keeps them (#468, ADR 0106): the list to
// show leaves out a watch's copy of a logged workout. They are shown next to Benchbite's own and
// count toward neither the streak nor the week.
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';

import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

import { activityOf, type Activity } from './activities';
import { OUTSIDE_WORKOUTS_KEY } from './outside-workouts-key';
import { useReading } from './use-read-ask';

/** As many as the server gives in one answer. */
const PAGE = 1000;
/** The most a list reads: as many as the server keeps of a user's from 400 days. */
const MOST = 3000;

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

const toListed = (row: Row): ListedOutsideWorkout => ({
  key: `${row.store}:${row.source_id}`,
  activity: activityOf(row.activity),
  startedAt: new Date(row.started_at),
  endedAt: new Date(row.ended_at),
  startedOn: row.started_on,
  activeKcal: row.active_kcal,
  heartRateAvg: row.heart_rate_avg,
  source: row.source,
});

const listQuery = () => supabase.from('outside_workout_list').select('*');

/** The list to show, narrowed by a filter, latest first, a page of the server's at a time. */
async function listed(
  narrow: (query: ReturnType<typeof listQuery>) => ReturnType<typeof listQuery>,
) {
  const workouts: ListedOutsideWorkout[] = [];
  for (let first = 0; first < MOST; first += PAGE) {
    const { data, error } = await narrow(listQuery())
      .order('started_at', { ascending: false })
      // Workouts that start at the same moment keep one order across pages.
      .order('store')
      .order('source_id')
      .range(first, first + PAGE - 1);
    if (error) throw error;
    workouts.push(...data.map(toListed));
    if (data.length < PAGE) break;
  }
  return workouts;
}

/** The workouts that started on the days from `first` to `last`, YYYY-MM-DD, latest first. */
export const outsideWorkoutsOn = (first: string, last: string) =>
  listed((query) => query.gte('started_on', first).lte('started_on', last));

/** A range of time, from a moment until before another; either open. */
export type TimeRange = { from: Date | null; to: Date | null };

/** The workouts that started within a range, latest first. */
export const outsideWorkoutsIn = ({ from, to }: TimeRange) =>
  listed((query) => {
    const since = from ? query.gte('started_at', from.toISOString()) : query;
    return to ? since.lt('started_at', to.toISOString()) : since;
  });

/** How many workouts started on each day, by its date. */
export function countByDay(workouts: ListedOutsideWorkout[]): Record<string, number> {
  const days: Record<string, number> = {};
  for (const workout of workouts) {
    days[workout.startedOn] = (days[workout.startedOn] ?? 0) + 1;
  }
  return days;
}

/**
 * The workouts of the days from `first` to `last`, while other apps' workouts are read; none once
 * they are no longer, though some were read before.
 */
export function useOutsideWorkoutsOn(first: string, last: string): ListedOutsideWorkout[] {
  const reading = useReading('workouts');
  const query = useQuery({
    queryKey: [...OUTSIDE_WORKOUTS_KEY, 'on', first, last],
    queryFn: () => outsideWorkoutsOn(first, last),
    enabled: reading,
    // Paging to another week keeps the last one's on screen until its own arrive.
    placeholderData: keepPreviousData,
  });
  return reading ? (query.data ?? []) : [];
}

/**
 * The workouts within each range, while other apps' workouts are read; none once they are no
 * longer. One query a range, so that a range added as the history loads an older page reads only
 * its own time, and a range that changes keeps what it showed until the rest arrive.
 */
export function useOutsideWorkoutsIn(ranges: TimeRange[], enabled = true): ListedOutsideWorkout[] {
  const reading = useReading('workouts');
  const results = useQueries({
    queries: ranges.map((range) => ({
      queryKey: [
        ...OUTSIDE_WORKOUTS_KEY,
        'in',
        range.from?.getTime() ?? null,
        range.to?.getTime() ?? null,
      ],
      queryFn: () => outsideWorkoutsIn(range),
      enabled: reading && enabled,
      placeholderData: keepPreviousData,
    })),
  });
  return reading ? results.flatMap((result) => result.data ?? []) : [];
}
