// Apple Health, through HealthKit. Apple never tells an app whether it may read a type: a type it
// may not read simply has no data, so access counts as allowed once asked.
import {
  isHealthDataAvailable,
  queryStatisticsForQuantity,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';

import type { HealthAvailability, HealthStore, WorkoutStats } from './types';

const READS = [
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
] as const;

export const store: HealthStore = 'appleHealth';

export const availability = (): Promise<HealthAvailability> =>
  Promise.resolve(isHealthDataAvailable() ? 'available' : 'unavailable');

export async function requestAccess(): Promise<boolean> {
  await requestAuthorization({ toRead: READS });
  return true;
}

export const stillAllowed = (): Promise<boolean> => Promise.resolve(true);

// An app cannot take back what was allowed; the Health app's Sharing settings can.
export const releaseAccess = (): Promise<void> => Promise.resolve();

// Apple Health is part of every iPhone.
export const installStore = (): void => undefined;

/**
 * The workout's heart rate and active calories. The module asks HealthKit for each source's
 * statistics too, so the sources come with them; a type that may not be read has no data.
 */
export async function workoutStats(from: Date, to: Date): Promise<WorkoutStats> {
  const filter = { date: { startDate: from, endDate: to } };
  const [heart, energy] = await Promise.all([
    queryStatisticsForQuantity(READS[0], ['discreteAverage', 'discreteMax'], {
      filter,
      unit: 'count/min',
    }),
    queryStatisticsForQuantity(READS[1], ['cumulativeSum'], { filter, unit: 'kcal' }),
  ]);
  return {
    averageBpm: heart.averageQuantity?.quantity ?? null,
    maxBpm: heart.maximumQuantity?.quantity ?? null,
    activeKcal: energy.sumQuantity?.quantity ?? null,
    source: heart.sources[0]?.name ?? energy.sources[0]?.name ?? null,
  };
}
