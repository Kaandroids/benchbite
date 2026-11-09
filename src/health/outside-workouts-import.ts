// Workouts other apps recorded, taken from the phone's health store (#468, ADR 0106). While the
// store is connected and they are read, every workout the store holds goes to
// import_outside_workouts(): the last 30 days the first time, then from the day last read on and at
// least the last 30 days, a year back at most. The store is the truth for the time read, so one
// deleted there goes here too. More than 500 go in parts of the time, as the function takes. The
// figures of workouts older than three days are taken as kept, not read again.
import type { QueryClient } from '@tanstack/react-query';

import { lastDays, toIsoDate } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';

import { setWorkoutsReadOn, workoutsReadOn } from './connection';
import { healthStore } from './health';
import {
  LEAST_DAYS,
  mayImport,
  oneAtATime,
  readFrom,
  signedInUser,
  stillImporting,
} from './import-guard';
import { OUTSIDE_WORKOUTS_KEY } from './outside-workouts-key';
import { outsideWorkouts } from './platform';
import type { HealthStore, OutsideWorkout, WorkoutFigures } from './types';

/**
 * How many days, today among them, a workout's figures are read again, for a watch that syncs them
 * late; an older workout's are taken as kept.
 */
const SETTLED_AFTER_DAYS = 3;
/**
 * The most kept figures taken, as many as the server gives in one answer: past it, a workout's are
 * read again from the store, which only takes longer.
 */
const MOST_KEPT_FIGURES = 1000;
/** The most workouts import_outside_workouts() takes at once. */
export const MOST_PER_PART = 500;

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
    .limit(MOST_KEPT_FIGURES);
  if (error) throw error;
  return new Map(
    data.map((row) => [
      row.source_id,
      { activeKcal: row.active_kcal, heartRateAvg: row.heart_rate_avg },
    ]),
  );
}

type Part = { since: Date; until: Date; workouts: OutsideWorkout[] };

/**
 * The time read in parts of at most 500 workouts each, latest last; a part never ends among
 * workouts that start at the same moment, so none falls between two.
 */
const sameStart = (a: OutsideWorkout, b: OutsideWorkout) => a.start.getTime() === b.start.getTime();

export function partsOf(workouts: OutsideWorkout[], from: Date, until: Date): Part[] {
  const sorted = [...workouts].sort((a, b) => a.start.getTime() - b.start.getTime());
  const parts: Part[] = [];
  let since = from;
  let first = 0;
  while (first < sorted.length) {
    let next = Math.min(first + MOST_PER_PART, sorted.length);
    while (next > first && next < sorted.length && sameStart(sorted[next]!, sorted[next - 1]!)) {
      next--;
    }
    // Every workout of the part starts as the next does: they all go in one, if they fit.
    if (next === first) {
      while (next < sorted.length && sameStart(sorted[next]!, sorted[first]!)) next++;
      if (next - first > MOST_PER_PART) {
        throw new Error(`More than ${MOST_PER_PART} workouts start at the same moment`);
      }
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
  const from = readFrom(workoutsReadOn(), LEAST_DAYS, now);
  // The figures of older workouts no longer change, so those kept are taken, not read again.
  const kept = {
    figures: await keptFigures(healthStore, from),
    before: lastDays(SETTLED_AFTER_DAYS, now),
  };
  const workouts = await outsideWorkouts(from, now, kept);
  // A read that could not be made sends nothing: the store would be taken as holding none, and the
  // workouts of the time read would go. Nor does it count for a user signed in since.
  if (workouts === null || !(await stillImporting('workouts', userId))) return false;
  let changed = false;
  try {
    // A minute past now, so that a workout that started as the store was read still falls within.
    for (const part of partsOf(workouts, from, new Date(now.getTime() + 60_000))) {
      // Each part is sent for the user the store was read for, or none is.
      if (!(await stillImporting('workouts', userId))) return changed;
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
  } finally {
    // The parts already kept show, though a later one failed.
    if (changed) await queryClient.invalidateQueries({ queryKey: OUTSIDE_WORKOUTS_KEY });
  }
  return changed;
}

/** Reads the workouts other apps recorded and keeps them; whether any changed. */
export const importOutsideWorkouts = oneAtATime(importNow);
