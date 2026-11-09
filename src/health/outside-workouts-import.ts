// Workouts other apps recorded, taken from the phone's health store (#468, ADR 0106). While the
// store is connected and they are read, every workout the store holds goes to
// import_outside_workouts(): the last 30 days the first time, then from the day last read on and at
// least the last 30 days, a year back at most. The store is the truth for the time read, so one
// deleted there goes here too. More than 500 go in parts of the time, as the function takes.
import type { QueryClient } from '@tanstack/react-query';

import { fromIsoDate, lastDays, toIsoDate } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';

import { setWorkoutsReadOn, workoutsReadOn } from './connection';
import { healthStore } from './health';
import { mayImport, oneAtATime, signedInUser, stillImporting } from './import-guard';
import { OUTSIDE_WORKOUTS_KEY } from './outside-workouts';
import { outsideWorkouts } from './platform';
import type { OutsideWorkout } from './types';

/** How many days, today among them, a read goes back at most. */
const MOST_DAYS = 366;
/** How many days a read goes back at least, for a watch that syncs late. */
const LEAST_DAYS = 30;
/** The most workouts import_outside_workouts() takes at once. */
export const MOST_PER_PART = 500;

/** Where a read starts: the day last read on, or 30 days back if later; a year back at most. */
function readFrom(now: Date): Date {
  const last = workoutsReadOn();
  const least = lastDays(LEAST_DAYS, now);
  if (last === null) return least;
  const from = fromIsoDate(last);
  const most = lastDays(MOST_DAYS, now);
  return from > least ? least : from < most ? most : from;
}

type Part = { since: Date; until: Date; workouts: OutsideWorkout[] };

/**
 * The time read in parts of at most 500 workouts each, latest last; a part never ends among
 * workouts that start at the same moment, so none falls between two.
 */
export function partsOf(workouts: OutsideWorkout[], from: Date, until: Date): Part[] {
  const sorted = [...workouts].sort((a, b) => a.start.getTime() - b.start.getTime());
  const parts: Part[] = [];
  let since = from;
  let first = 0;
  while (first < sorted.length) {
    let next = Math.min(first + MOST_PER_PART, sorted.length);
    while (
      next > first + 1 &&
      next < sorted.length &&
      sorted[next]!.start <= sorted[next - 1]!.start
    ) {
      next--;
    }
    const end = next < sorted.length ? sorted[next]!.start : until;
    parts.push({ since, until: end, workouts: sorted.slice(first, next) });
    since = end;
    first = next;
  }
  return parts.length ? parts : [{ since: from, until, workouts: [] }];
}

async function importNow(queryClient: QueryClient): Promise<boolean> {
  if (!mayImport('workouts') || healthStore === null) return false;
  const userId = await signedInUser();
  const now = new Date();
  const from = readFrom(now);
  const workouts = await outsideWorkouts(from, now);
  // A read that could not be made sends nothing: the store would be taken as holding none, and the
  // workouts of the time read would go. Nor does it count for a user signed in since.
  if (workouts === null || !(await stillImporting('workouts', userId))) return false;
  let changed = false;
  // A minute past now, so that a workout that started as the store was read still falls within.
  for (const part of partsOf(workouts, from, new Date(now.getTime() + 60_000))) {
    const { data, error } = await supabase.rpc('import_outside_workouts', {
      workouts: part.workouts.map((workout) => ({
        id: workout.id,
        activity: workout.activity,
        startedAt: workout.start.toISOString(),
        endedAt: workout.end.toISOString(),
        startedOn: toIsoDate(workout.start),
        activeKcal: workout.activeKcal,
        heartRateAvg: workout.heartRateAvg,
        source: workout.source,
      })),
      health_store: healthStore,
      since: part.since.toISOString(),
      until: part.until.toISOString(),
      today: toIsoDate(now),
    });
    if (error) throw error;
    changed = (data ?? 0) > 0 || changed;
  }
  if (await stillImporting('workouts', userId)) setWorkoutsReadOn(toIsoDate(now));
  if (changed) await queryClient.invalidateQueries({ queryKey: OUTSIDE_WORKOUTS_KEY });
  return changed;
}

/** Reads the workouts other apps recorded and keeps them; whether any changed. */
export const importOutsideWorkouts = oneAtATime(importNow);
