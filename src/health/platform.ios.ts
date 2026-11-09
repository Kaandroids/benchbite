// Apple Health, through HealthKit. Apple never tells an app whether it may read a type: a type it
// may not read simply has no data, so access counts as allowed once asked.
import {
  AuthorizationStatus,
  authorizationStatusFor,
  ComparisonPredicateOperator,
  deleteObjects,
  isHealthDataAvailable,
  queryQuantitySamples,
  queryStatisticsCollectionForQuantity,
  queryStatisticsForQuantity,
  queryStatisticsForQuantitySeparateBySource,
  queryWorkoutSamples,
  requestAuthorization,
  saveWorkoutSample,
  WorkoutActivityType,
} from '@kingstinct/react-native-healthkit';

import { applicationId } from 'expo-application';

import { toIsoDate } from '@/i18n/dates';

import { HEALTHKIT_ACTIVITIES } from './activities';
import { inBatches } from './batches';
import { heartRateSamples } from './samples';
import {
  coversMostOf,
  isSavedWorkoutId,
  keptFiguresOf,
  NO_WORKOUT_STATS,
  savedWorkoutId,
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

const HEART_RATE = 'HKQuantityTypeIdentifierHeartRate';
const ACTIVE_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned';
const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass';
const STEP_COUNT = 'HKQuantityTypeIdentifierStepCount';
const WORKOUT = 'HKWorkoutTypeIdentifier';
const READS = [HEART_RATE, ACTIVE_ENERGY, BODY_MASS, STEP_COUNT, WORKOUT] as const;

/** The metadata a saved workout and its calories are known by, and the calories it was saved with. */
const EXTERNAL_ID = 'HKExternalUUID';
const SAVED_KCAL = 'BenchbiteActiveKcal';

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
  // The samples only draw the chart: without them the read keeps its average and highest.
  const points = await queryQuantitySamples(HEART_RATE, {
    filter,
    unit: 'count/min',
    ascending: true,
    limit: 0,
  }).catch((error: unknown) => {
    console.warn('Could not read the heart rate samples', error);
    return [];
  });
  return {
    heartRate: { average, max },
    activeKcal: energy.length
      ? energy.reduce((sum, part) => sum + (part.sumQuantity?.quantity ?? 0), 0)
      : null,
    source: heart.sources[0]?.name ?? null,
    samples: heartRateSamples(
      points.map((point) => ({ at: point.startDate, bpm: point.quantity })),
      from,
      to,
    ),
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
export async function dailySteps(from: Date, to: Date): Promise<StepDay[]> {
  const days = await queryStatisticsCollectionForQuantity(
    STEP_COUNT,
    ['cumulativeSum'],
    from,
    { day: 1 },
    { filter: { date: { startDate: from, endDate: to } }, unit: 'count' },
  );
  return days.flatMap((day) =>
    day.startDate && day.sumQuantity
      ? [{ day: toIsoDate(day.startDate), steps: day.sumQuantity.quantity }]
      : [],
  );
}

// Apple tells an app whether it may write a type, unlike whether it may read one. A workout is
// saved with its calories, so both have to be allowed: Apple lets the user allow either alone.
export const writeAllowed = (): Promise<boolean> =>
  Promise.resolve(
    ([WORKOUT, ACTIVE_ENERGY] as const).every(
      (type) => authorizationStatusFor(type) === AuthorizationStatus.sharingAuthorized,
    ),
  );

export async function requestWriteAccess(): Promise<boolean> {
  await requestAuthorization({ toShare: [WORKOUT, ACTIVE_ENERGY], toRead: [WORKOUT] });
  return writeAllowed();
}

/** Benchbite's samples of a log's workout, the workout and its calories, by the id they were saved with. */
const savedOf = (logId: number) => ({
  metadata: {
    withMetadataKey: EXTERNAL_ID,
    operatorType: ComparisonPredicateOperator.equalTo,
    value: savedWorkoutId(logId),
  },
});

/** Whether a workout is one Benchbite saved: by its id, and written by this app, as another can copy the id. */
const savedByBenchbite = (workout: {
  metadata: Record<string, unknown>;
  sourceRevision: { source: { bundleIdentifier: string } };
}) =>
  workout.sourceRevision.source.bundleIdentifier === applicationId &&
  isSavedWorkoutId(workout.metadata[EXTERNAL_ID]);

// An app may always read what it wrote itself, so Benchbite's copy is found even when reading
// workouts was not allowed; other apps' workouts are then simply not seen.
export async function storedWorkouts(logId: number, from: Date, to: Date): Promise<StoredWorkouts> {
  const workouts = await queryWorkoutSamples({
    filter: { date: { startDate: from, endDate: to } },
    limit: 0,
  });
  const id = savedWorkoutId(logId);
  const ours = workouts.find(
    (workout) => savedByBenchbite(workout) && workout.metadata[EXTERNAL_ID] === id,
  );
  const kcal = ours?.metadata[SAVED_KCAL];
  return {
    ours: ours ? { activeKcal: typeof kcal === 'number' ? kcal : null } : null,
    others: workouts.some(
      (workout) =>
        !savedByBenchbite(workout) &&
        coversMostOf({ start: workout.startDate, end: workout.endDate }, from, to),
    ),
  };
}

// The calories are saved as a sample of the workout's time too, which the Activity rings count.
// The library gives that sample the workout's metadata, so it is taken out with it.
export async function saveWorkout({ logId, start, end, activeKcal }: WorkoutToSave): Promise<void> {
  await removeWorkout(logId);
  const id = savedWorkoutId(logId);
  await saveWorkoutSample(
    WorkoutActivityType.traditionalStrengthTraining,
    activeKcal === null
      ? []
      : [
          {
            quantityType: ACTIVE_ENERGY,
            quantity: activeKcal,
            unit: 'kcal',
            startDate: start,
            endDate: end,
          },
        ],
    start,
    end,
    activeKcal === null ? undefined : { energyBurned: activeKcal },
    { [EXTERNAL_ID]: id, ...(activeKcal === null ? {} : { [SAVED_KCAL]: activeKcal }) },
  );
}

export async function removeWorkout(logId: number): Promise<void> {
  await deleteObjects(WORKOUT, savedOf(logId));
  await deleteObjects(ACTIVE_ENERGY, savedOf(logId));
}

// Apple never tells whether workouts may be read: none may simply be found.
export const workoutsAllowed = (): Promise<boolean> => Promise.resolve(true);

export async function requestWorkoutsAccess(): Promise<boolean> {
  await requestAuthorization({ toRead: [WORKOUT] });
  return true;
}

/**
 * The workouts other apps recorded, with the average heart rate measured during each, which the
 * workout itself does not hold. Benchbite's own are left out: they are its logs (ADR 0105).
 */
export async function outsideWorkouts(
  from: Date,
  to: Date,
  kept?: KeptFigures,
): Promise<OutsideWorkout[]> {
  const workouts = await queryWorkoutSamples({
    filter: { date: { startDate: from, endDate: to } },
    limit: 0,
  });
  const others = workouts.filter(
    (workout) =>
      workout.sourceRevision.source.bundleIdentifier !== applicationId && workout.startDate >= from,
  );
  return inBatches(others, async (workout) => {
    // A failed read throws: a heart rate taken as none would replace the one kept.
    const known = keptFiguresOf(kept, workout.uuid, workout.startDate);
    const heartRateAvg = known
      ? known.heartRateAvg
      : ((
          await queryStatisticsForQuantity(HEART_RATE, ['discreteAverage'], {
            filter: { date: { startDate: workout.startDate, endDate: workout.endDate } },
            unit: 'count/min',
          })
        ).averageQuantity?.quantity ?? null);
    return {
      id: workout.uuid,
      activity: HEALTHKIT_ACTIVITIES[WorkoutActivityType[workout.workoutActivityType]] ?? 'other',
      start: workout.startDate,
      end: workout.endDate,
      // The library gives it in kilocalories.
      activeKcal: workout.totalEnergyBurned?.quantity ?? null,
      heartRateAvg,
      source: workout.sourceRevision.source.name || null,
    };
  });
}
