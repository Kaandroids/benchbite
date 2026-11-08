// Where the app reads no health data, as on the web. iOS and Android read through
// platform.ios.ts and platform.android.ts, which keep the same exports.
import {
  NO_WORKOUT_STATS,
  type HealthAvailability,
  type HealthStore,
  type WeightReading,
  type WorkoutStats,
} from './types';

export const store: HealthStore = null;

export const availability = (): Promise<HealthAvailability> => Promise.resolve('unavailable');

/** Asks the system for heart rate and active calories; whether reading was allowed. */
export const requestAccess = (): Promise<boolean> => Promise.resolve(false);

/** Whether reading is still allowed, as the system may have taken it back since. */
export const stillAllowed = (): Promise<boolean> => Promise.resolve(false);

/** Gives up what was allowed, where the system lets an app do so. */
export const releaseAccess = (): Promise<void> => Promise.resolve();

/** Opens where the store is installed or updated, where it is an app of its own. */
export const installStore = (): void => undefined;

/** The heart rate and active calories measured between two times, unrounded. */
export const workoutStats = (_from: Date, _to: Date): Promise<WorkoutStats> =>
  Promise.resolve(NO_WORKOUT_STATS);

/** Whether weight may be read, where the system says so. */
export const weightAllowed = (): Promise<boolean> => Promise.resolve(false);

/** Asks for weight alone, for a user who connected before it was read; whether it was allowed. */
export const requestWeightAccess = (): Promise<boolean> => Promise.resolve(false);

/** The weighings since a time, in no set order. */
export const weightsSince = (_from: Date): Promise<WeightReading[]> => Promise.resolve([]);
