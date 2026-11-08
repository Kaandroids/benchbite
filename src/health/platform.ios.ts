// Apple Health, through HealthKit. Apple never tells an app whether it may read a type: a type it
// may not read simply has no data, so access counts as allowed once asked.
import {
  isHealthDataAvailable,
  queryQuantitySamples,
  queryStatisticsCollectionForQuantity,
  queryStatisticsForQuantity,
  queryStatisticsForQuantitySeparateBySource,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';

import { toIsoDate } from '@/i18n/dates';

import {
  NO_WORKOUT_STATS,
  type HealthAvailability,
  type HealthStore,
  type StepDay,
  type WeightReading,
  type WorkoutStats,
} from './types';

const HEART_RATE = 'HKQuantityTypeIdentifierHeartRate';
const ACTIVE_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned';
const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass';
const STEP_COUNT = 'HKQuantityTypeIdentifierStepCount';
const READS = [HEART_RATE, ACTIVE_ENERGY, BODY_MASS, STEP_COUNT] as const;

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
 * The workout's heart rate, and the active calories of the apps that measured it: the phone counts
 * some from motion too, which no watch measured. The module asks HealthKit for each source's
 * statistics, so the heart rate's sources come with it; a type that may not be read has no data.
 */
export async function workoutStats(from: Date, to: Date): Promise<WorkoutStats> {
  const filter = { date: { startDate: from, endDate: to } };
  const heart = await queryStatisticsForQuantity(HEART_RATE, ['discreteAverage', 'discreteMax'], {
    filter,
    unit: 'count/min',
  });
  const average = heart.averageQuantity?.quantity;
  const max = heart.maximumQuantity?.quantity;
  if (average === undefined || max === undefined) return NO_WORKOUT_STATS;

  const watch = new Set(heart.sources.map((source) => source.bundleIdentifier));
  const energy = (
    await queryStatisticsForQuantitySeparateBySource(ACTIVE_ENERGY, ['cumulativeSum'], {
      filter,
      unit: 'kcal',
    })
  ).filter((part) => watch.has(part.source.bundleIdentifier) && part.sumQuantity);
  return {
    heartRate: { average, max },
    activeKcal: energy.length
      ? energy.reduce((sum, part) => sum + (part.sumQuantity?.quantity ?? 0), 0)
      : null,
    source: heart.sources[0]?.name ?? null,
  };
}

export const weightAllowed = (): Promise<boolean> => Promise.resolve(true);

export async function requestWeightAccess(): Promise<boolean> {
  await requestAuthorization({ toRead: [BODY_MASS] });
  return true;
}

export async function weightsSince(from: Date): Promise<WeightReading[]> {
  const samples = await queryQuantitySamples(BODY_MASS, {
    filter: { date: { startDate: from } },
    unit: 'kg',
    ascending: true,
    limit: 0,
  });
  return samples.map((sample) => ({
    at: sample.startDate,
    weightKg: sample.quantity,
    source: sample.sourceRevision.source.name || null,
  }));
}

export const stepsAllowed = (): Promise<boolean> => Promise.resolve(true);

export async function requestStepsAccess(): Promise<boolean> {
  await requestAuthorization({ toRead: [STEP_COUNT] });
  return true;
}

// One sum a day, which HealthKit takes from the phone and a watch without counting a step twice.
export async function dailySteps(from: Date): Promise<StepDay[]> {
  const days = await queryStatisticsCollectionForQuantity(
    STEP_COUNT,
    ['cumulativeSum'],
    from,
    { day: 1 },
    { filter: { date: { startDate: from, endDate: new Date() } }, unit: 'count' },
  );
  return days.flatMap((day) =>
    day.startDate && day.sumQuantity
      ? [{ day: toIsoDate(day.startDate), steps: day.sumQuantity.quantity }]
      : [],
  );
}
