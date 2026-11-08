// Apple Health, through HealthKit. Apple never tells an app whether it may read a type: a type it
// may not read simply has no data.
import {
  isHealthDataAvailable,
  queryStatisticsForQuantity,
  queryStatisticsForQuantitySeparateBySource,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import { Linking } from 'react-native';

import type { HealthAvailability, HealthStore, WorkoutStats } from './health';

const HEART_RATE = 'HKQuantityTypeIdentifierHeartRate';
const ACTIVE_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned';

export const store: HealthStore = 'appleHealth';

export const availability = (): Promise<HealthAvailability> =>
  Promise.resolve(isHealthDataAvailable() ? 'available' : 'unavailable');

export async function requestAccess(): Promise<boolean> {
  await requestAuthorization({ toRead: [HEART_RATE, ACTIVE_ENERGY] });
  return true;
}

// An app cannot take back what was allowed; the Health app's Sharing settings can.
export const releaseAccess = (): Promise<void> => Promise.resolve();

export const openStore = (_availability: HealthAvailability): void =>
  void Linking.openURL('x-apple-health://');

export async function workoutStats(from: Date, to: Date): Promise<WorkoutStats> {
  const filter = { date: { startDate: from, endDate: to } };
  const [heart, energy, sources] = await Promise.all([
    queryStatisticsForQuantity(HEART_RATE, ['discreteAverage', 'discreteMax'], {
      filter,
      unit: 'count/min',
    }),
    queryStatisticsForQuantity(ACTIVE_ENERGY, ['cumulativeSum'], { filter, unit: 'kcal' }),
    queryStatisticsForQuantitySeparateBySource(HEART_RATE, ['discreteAverage'], { filter }),
  ]);
  return {
    averageBpm: rounded(heart.averageQuantity?.quantity),
    maxBpm: rounded(heart.maximumQuantity?.quantity),
    activeKcal: rounded(energy.sumQuantity?.quantity),
    source: sources[0]?.source.name ?? energy.sources[0]?.name ?? null,
  };
}

const rounded = (value: number | undefined) =>
  value === undefined || !Number.isFinite(value) ? null : Math.round(value);
