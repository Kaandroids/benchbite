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
};

/** Nothing measured. */
export const NO_WORKOUT_STATS: WorkoutStats = { heartRate: null, activeKcal: null, source: null };

/** A weighing the store holds: when, how much, and the app or scale that measured it. */
export type WeightReading = { at: Date; weightKg: number; source: string | null };

/** The steps the store counted on a day, as YYYY-MM-DD by the phone's clock. */
export type StepDay = { day: string; steps: number };
