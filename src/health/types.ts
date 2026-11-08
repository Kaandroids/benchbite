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
  averageBpm: number | null;
  maxBpm: number | null;
  activeKcal: number | null;
  /** The app or watch that measured the heart rate, or else the calories, by its name. */
  source: string | null;
};
