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
 * it was saved with, and whether another app, as a watch's, recorded one.
 */
export type StoredWorkouts = { ours: { activeKcal: number | null } | null; others: boolean };

/** Nothing in the store. */
export const NO_STORED_WORKOUTS: StoredWorkouts = { ours: null, others: false };

/** How Benchbite's own copy of a workout is known in the store, by its log. */
export const savedWorkoutId = (logId: number) => `benchbite-log-${logId}`;

/** Whether an id is that of a workout Benchbite saved. */
export const isSavedWorkoutId = (id: unknown) =>
  typeof id === 'string' && id.startsWith('benchbite-log-');
