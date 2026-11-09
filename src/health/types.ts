import type { Activity } from './activities';

// The types of the health store's interface (#467, ADR 0097), apart from it, which each
// platform's module implements.

/** The phone's store of health data, or none where the app has no way to read one. */
export type HealthStore = 'appleHealth' | 'healthConnect' | null;

/**
 * Whether the store can be read: Android may need Health Connect installed or updated from Google
 * Play first, and cannot have it at all before Android 9.
 */
export type HealthAvailability = 'available' | 'missing' | 'unavailable';

/** What was measured between two times: each part missing when nothing measured it. */
export type WorkoutStats = {
  /** The average and highest heart rate, in beats a minute, unrounded. */
  heartRate: { average: number; max: number } | null;
  /** The active calories of the apps that measured the heart rate, which a watch writes. */
  activeKcal: number | null;
  /** The app or watch that measured the heart rate, by its name. */
  source: string | null;
  /** The heart rate every 10 seconds from the start (heartRateSamples()); null without any. */
  samples: (number | null)[] | null;
};

/** Nothing measured. */
export const NO_WORKOUT_STATS: WorkoutStats = {
  heartRate: null,
  activeKcal: null,
  source: null,
  samples: null,
};

/** A weighing the store holds: when, how much, and the app or scale that measured it. */
export type WeightReading = { at: Date; weightKg: number; source: string | null };

/** The steps the store counted on a day, as YYYY-MM-DD by the phone's clock. */
export type StepDay = { day: string; steps: number };

/** A finished workout as Benchbite saves it to the store (ADR 0105). */
export type WorkoutToSave = { logId: number; start: Date; end: Date; activeKcal: number | null };

/**
 * The workouts the store holds in a workout's time: Benchbite's own copy of it, with the calories
 * it was saved with, and whether another app, as a watch's, recorded the same workout.
 */
export type StoredWorkouts = { ours: { activeKcal: number | null } | null; others: boolean };

/** Nothing in the store. */
export const NO_STORED_WORKOUTS: StoredWorkouts = { ours: null, others: false };

const SAVED_ID_PREFIX = 'benchbite-log-';

/** How Benchbite's own copy of a workout is known in the store, by its log. */
export const savedWorkoutId = (logId: number) => `${SAVED_ID_PREFIX}${logId}`;

/** Whether an id is that of a workout Benchbite saved. */
export const isSavedWorkoutId = (id: unknown) =>
  typeof id === 'string' && id.startsWith(SAVED_ID_PREFIX);

/**
 * Whether another app's workout is the log's own, as a watch recorded it: one that covers more than
 * half of the log's time. A run just before or after only touches it.
 */
export function coversMostOf(workout: { start: Date; end: Date }, from: Date, to: Date): boolean {
  const overlap =
    Math.min(workout.end.getTime(), to.getTime()) -
    Math.max(workout.start.getTime(), from.getTime());
  return overlap > (to.getTime() - from.getTime()) / 2;
}

/**
 * A workout another app or watch recorded in the store (#468, ADR 0106): what was done, when, and
 * what was measured, each figure missing when nothing measured it.
 */
export type OutsideWorkout = {
  /** The store's own id of it. */
  id: string;
  activity: Activity;
  start: Date;
  end: Date;
  activeKcal: number | null;
  heartRateAvg: number | null;
  /** The app or watch that recorded it, by its name. */
  source: string | null;
};
