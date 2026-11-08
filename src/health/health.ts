// What a watch or another app measured, read from Apple Health on iOS and Health Connect on Android
// (#467, ADR 0097). Each platform reads through its own module in platform.*.ts; the rest of the
// app knows only this file.
import * as platform from './platform';

/** The phone's store of health data, or none where the app has no way to read one. */
export type HealthStore = 'appleHealth' | 'healthConnect' | null;

/** Whether the store can be read: Android may need Health Connect installed or updated first. */
export type HealthAvailability = 'available' | 'notInstalled' | 'updateRequired' | 'unavailable';

/** What was measured between two times: each part missing when nothing measured it. */
export type WorkoutStats = {
  averageBpm: number | null;
  maxBpm: number | null;
  activeKcal: number | null;
  /** The app or watch that measured the heart rate, or else the calories, by its name. */
  source: string | null;
};

export const healthStore: HealthStore = platform.store;

export const healthAvailability = (): Promise<HealthAvailability> => platform.availability();

/**
 * Asks for heart rate and active calories, with the system's own screen. Whether reading was
 * allowed: on iOS always true, as Apple does not tell an app whether it may read.
 */
export const requestHealthAccess = (): Promise<boolean> => platform.requestAccess();

/** Gives up what was allowed, where the system lets an app do so (Android). */
export const releaseHealthAccess = (): Promise<void> => platform.releaseAccess();

/** Opens the store's app, for the user to install it or change what Benchbite may read. */
export const openHealthStore = (availability: HealthAvailability): void =>
  platform.openStore(availability);

/** The heart rate and active calories measured between two times. */
export const workoutStats = (from: Date, to: Date): Promise<WorkoutStats> =>
  platform.workoutStats(from, to);
