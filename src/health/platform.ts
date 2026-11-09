// Where the app reads no health data, as on the web. iOS and Android read through
// platform.ios.ts and platform.android.ts, which keep the same exports.
import {
  NO_STORED_WORKOUTS,
  NO_WORKOUT_STATS,
  type HealthAvailability,
  type HealthStore,
  type KeptFigures,
  type OutsideWorkout,
  type StepDay,
  type StoredWorkouts,
  type WeightReading,
  type WorkoutStats,
  type WorkoutToSave,
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

/** Whether steps may be read, where the system says so. */
export const stepsAllowed = (): Promise<boolean> => Promise.resolve(false);

/** Asks for steps alone, for a user who connected before they were read; whether allowed. */
export const requestStepsAccess = (): Promise<boolean> => Promise.resolve(false);

/** The steps of each day from a day's start until a time, in no set order; days without any left out. */
export const dailySteps = (_from: Date, _to: Date): Promise<StepDay[]> => Promise.resolve([]);

/** Whether workouts may be written, where the system says so (ADR 0105). */
export const writeAllowed = (): Promise<boolean> => Promise.resolve(false);

/** Asks to write workouts and their active calories; whether writing was allowed. */
export const requestWriteAccess = (): Promise<boolean> => Promise.resolve(false);

/** The workouts the store holds between two times, Benchbite's copy of a log's among them. */
export const storedWorkouts = (_logId: number, _from: Date, _to: Date): Promise<StoredWorkouts> =>
  Promise.resolve(NO_STORED_WORKOUTS);

/** Saves a workout, in place of the copy Benchbite saved of it before. */
export const saveWorkout = (_workout: WorkoutToSave): Promise<void> => Promise.resolve();

/** Takes Benchbite's copy of a log's workout out of the store. */
export const removeWorkout = (_logId: number): Promise<void> => Promise.resolve();

/** Whether other apps' workouts may be read, where the system says so (ADR 0106). */
export const workoutsAllowed = (): Promise<boolean> => Promise.resolve(false);

/** Asks for other apps' workouts alone; whether reading them was allowed. */
export const requestWorkoutsAccess = (): Promise<boolean> => Promise.resolve(false);

/**
 * The workouts other apps recorded that started between two times, in no set order, with the
 * figures kept of older ones in place of reading them again. Null when they could not be read, as
 * without the permission or when a figure's read failed, which is not a store without any.
 */
export const outsideWorkouts = (
  _from: Date,
  _to: Date,
  _kept?: KeptFigures,
): Promise<OutsideWorkout[] | null> => Promise.resolve(null);
