// Where the app reads no health data, as on the web: nothing is available. iOS and Android read
// through platform.ios.ts and platform.android.ts, which keep the same exports.
import type { HealthAvailability, HealthStore, WorkoutStats } from './health';

export const store: HealthStore = null;

export const availability = (): Promise<HealthAvailability> => Promise.resolve('unavailable');

export const requestAccess = (): Promise<boolean> => Promise.resolve(false);

export const releaseAccess = (): Promise<void> => Promise.resolve();

export const openStore = (_availability: HealthAvailability): void => undefined;

export const workoutStats = (_from: Date, _to: Date): Promise<WorkoutStats> =>
  Promise.resolve({ averageBpm: null, maxBpm: null, activeKcal: null, source: null });
