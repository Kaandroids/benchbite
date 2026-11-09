// Health Connect: built into Android 14 and later, an app from Google Play on Android 9 to 13, and
// not available before.
import {
  aggregateGroupByPeriod,
  aggregateRecord,
  deleteRecordsByUuids,
  ExerciseType,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  insertRecords,
  readRecords,
  requestPermission,
  revokeAllPermissions,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';
import { Linking } from 'react-native';

import { heartRateSamples, type HeartRatePoint } from './samples';
import {
  isSavedWorkoutId,
  NO_STORED_WORKOUTS,
  NO_WORKOUT_STATS,
  savedWorkoutId,
  type HealthAvailability,
  type HealthStore,
  type StepDay,
  type StoredWorkouts,
  type WeightReading,
  type WorkoutStats,
  type WorkoutToSave,
} from './types';

const PERMISSIONS = [
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'read', recordType: 'Steps' },
] as const;

const PLAY_STORE = 'market://details?id=com.google.android.apps.healthdata';

/** The names of the apps that most often write to Health Connect, by their package. */
const APP_NAMES: Record<string, string> = {
  'com.google.android.apps.fitness': 'Google Fit',
  'com.huami.watch.hmwatchmanager': 'Zepp',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.google.android.apps.healthdata': 'Health Connect',
};

/** The app's name for a package that wrote data, or the package itself. */
const sourceName = (origin: string | undefined): string | null =>
  origin ? (APP_NAMES[origin] ?? origin) : null;

export const store: HealthStore = 'healthConnect';

export async function availability(): Promise<HealthAvailability> {
  const status = await getSdkStatus();
  // Health Connect reports one that is not installed, on Android 9 to 13, as one to update.
  if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return 'available';
  if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'missing';
  return 'unavailable';
}

/** Whether a type may be read. */
async function allowedToRead(recordType: string): Promise<boolean> {
  const granted = await getGrantedPermissions();
  return granted.some(
    (permission) => permission.accessType === 'read' && permission.recordType === recordType,
  );
}

/** Whether heart rate, the part a workout needs most, may be read. */
const heartRateAllowed = () => allowedToRead('HeartRate');

export async function requestAccess(): Promise<boolean> {
  if (!(await initialize())) return false;
  await requestPermission([...PERMISSIONS]);
  return heartRateAllowed();
}

export async function stillAllowed(): Promise<boolean> {
  return (await initialize()) && heartRateAllowed();
}

export async function releaseAccess(): Promise<void> {
  if (await initialize()) {
    await revokeAllPermissions();
  }
}

export const installStore = (): void => void Linking.openURL(PLAY_STORE);

/**
 * The workout's heart rate, and the active calories of the apps that measured it: a phone's own
 * count from motion is no watch's. Health Connect refuses to sum a type the app may not read, so
 * only the allowed ones are asked for.
 */
export async function workoutStats(from: Date, to: Date): Promise<WorkoutStats> {
  if (!(await initialize())) return NO_WORKOUT_STATS;
  const granted = await getGrantedPermissions();
  const allowed = (recordType: string) =>
    granted.some(
      (permission) => permission.accessType === 'read' && permission.recordType === recordType,
    );
  const timeRangeFilter = {
    operator: 'between' as const,
    startTime: from.toISOString(),
    endTime: to.toISOString(),
  };
  if (!allowed('HeartRate')) return NO_WORKOUT_STATS;
  const heart = await aggregateRecord({ recordType: 'HeartRate', timeRangeFilter });
  if (heart.MEASUREMENTS_COUNT === 0) return NO_WORKOUT_STATS;

  let activeKcal: number | null = null;
  if (allowed('ActiveCaloriesBurned')) {
    try {
      const energy = await aggregateRecord({
        recordType: 'ActiveCaloriesBurned',
        timeRangeFilter,
        dataOriginFilter: heart.dataOrigins,
      });
      const kcal = energy.ACTIVE_CALORIES_TOTAL.inKilocalories;
      activeKcal = kcal > 0 ? kcal : null;
    } catch (error) {
      console.warn('Could not read the active calories', error);
    }
  }
  return {
    heartRate: { average: heart.BPM_AVG, max: heart.BPM_MAX },
    activeKcal,
    source: sourceName(heart.dataOrigins[0]),
    // The samples only draw the chart: without them the read keeps its average and highest.
    samples: heartRateSamples(
      await heartRatePoints(timeRangeFilter).catch((error: unknown) => {
        console.warn('Could not read the heart rate samples', error);
        return [];
      }),
      from,
      to,
    ),
  };
}

export const weightAllowed = () => allowedToRead('Weight');

export async function requestWeightAccess(): Promise<boolean> {
  if (!(await initialize())) return false;
  await requestPermission([{ accessType: 'read', recordType: 'Weight' }]);
  return weightAllowed();
}

export async function weightsSince(from: Date): Promise<WeightReading[]> {
  if (!(await initialize()) || !(await weightAllowed())) return [];
  const { records } = await readRecords('Weight', {
    timeRangeFilter: { operator: 'after', startTime: from.toISOString() },
    // Newest first, so a page that cannot hold them all leaves out the oldest.
    ascendingOrder: false,
    pageSize: 1000,
  });
  return records.map((record) => ({
    at: new Date(record.time),
    weightKg: record.weight.inKilograms,
    source: sourceName(record.metadata?.dataOrigin),
  }));
}

/**
 * The most pages of heart rate records read for one workout: a record holds many samples, so 20
 * pages of 1000 are far more than the 4320 values a 12-hour workout keeps.
 */
const MOST_HEART_RATE_PAGES = 20;

/** A range of time as Health Connect's reads take it, which the library does not export. */
type TimeRangeFilter = Parameters<typeof readRecords>[1]['timeRangeFilter'];

/** Every heart rate sample between two times, page by page. */
async function heartRatePoints(timeRangeFilter: TimeRangeFilter): Promise<HeartRatePoint[]> {
  const points: HeartRatePoint[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MOST_HEART_RATE_PAGES; page++) {
    const { records, pageToken: next } = await readRecords('HeartRate', {
      timeRangeFilter,
      pageSize: 1000,
      ...(pageToken ? { pageToken } : {}),
    });
    for (const record of records) {
      for (const sample of record.samples) {
        points.push({ at: new Date(sample.time), bpm: sample.beatsPerMinute });
      }
    }
    if (!next) break;
    pageToken = next;
  }
  return points;
}

export const stepsAllowed = () => allowedToRead('Steps');

export async function requestStepsAccess(): Promise<boolean> {
  if (!(await initialize())) return false;
  await requestPermission([{ accessType: 'read', recordType: 'Steps' }]);
  return stepsAllowed();
}

// One total a day, which Health Connect takes from every app without counting a step twice. The
// days are the phone's: the library reads the times in its time zone.
export async function dailySteps(from: Date, to: Date): Promise<StepDay[]> {
  if (!(await initialize()) || !(await stepsAllowed())) return [];
  const days = await aggregateGroupByPeriod({
    recordType: 'Steps',
    timeRangeFilter: {
      operator: 'between',
      startTime: from.toISOString(),
      endTime: to.toISOString(),
    },
    timeRangeSlicer: { period: 'DAYS', length: 1 },
  });
  return days.flatMap(({ result, startTime }) =>
    result.dataOrigins.length > 0
      ? [{ day: startTime.slice(0, 10), steps: result.COUNT_TOTAL }]
      : [],
  );
}

const WRITES = [
  { accessType: 'write', recordType: 'ExerciseSession' },
  { accessType: 'write', recordType: 'ActiveCaloriesBurned' },
  // To find a workout a watch's app recorded, which is then not saved again (ADR 0105).
  { accessType: 'read', recordType: 'ExerciseSession' },
] as const;

export async function writeAllowed(): Promise<boolean> {
  if (!(await initialize())) return false;
  const granted = await getGrantedPermissions();
  return granted.some(
    (permission) =>
      permission.accessType === 'write' && permission.recordType === 'ExerciseSession',
  );
}

export async function requestWriteAccess(): Promise<boolean> {
  if (!(await initialize())) return false;
  await requestPermission([...WRITES]);
  return writeAllowed();
}

// Health Connect lets an app read what it wrote itself, so Benchbite's copy is found even when
// reading exercise was not allowed; other apps' workouts are then simply not seen.
export async function storedWorkouts(logId: number, from: Date, to: Date): Promise<StoredWorkouts> {
  if (!(await initialize())) return NO_STORED_WORKOUTS;
  const timeRangeFilter = {
    operator: 'between' as const,
    startTime: from.toISOString(),
    endTime: to.toISOString(),
  };
  const id = savedWorkoutId(logId);
  const { records } = await readRecords('ExerciseSession', { timeRangeFilter });
  if (!records.some((record) => record.metadata?.clientRecordId === id)) {
    return { ours: null, others: records.length > 0 };
  }
  const { records: energy } = await readRecords('ActiveCaloriesBurned', { timeRangeFilter });
  const kcal = energy.find((record) => record.metadata?.clientRecordId === id);
  return {
    ours: { activeKcal: kcal ? kcal.energy.inKilocalories : null },
    others: records.some((record) => !isSavedWorkoutId(record.metadata?.clientRecordId)),
  };
}

// A record with the same client id replaces the one before when its version is higher.
export async function saveWorkout({ logId, start, end, activeKcal }: WorkoutToSave): Promise<void> {
  if (!(await initialize())) return;
  const metadata = { clientRecordId: savedWorkoutId(logId), clientRecordVersion: Date.now() };
  const times = { startTime: start.toISOString(), endTime: end.toISOString() };
  await insertRecords([
    {
      recordType: 'ExerciseSession',
      exerciseType: ExerciseType.STRENGTH_TRAINING,
      ...times,
      metadata,
    },
    ...(activeKcal === null
      ? []
      : [
          {
            recordType: 'ActiveCaloriesBurned' as const,
            energy: { unit: 'kilocalories' as const, value: activeKcal },
            ...times,
            metadata,
          },
        ]),
  ]);
  if (activeKcal === null) {
    await deleteRecordsByUuids('ActiveCaloriesBurned', [], [savedWorkoutId(logId)]);
  }
}

export async function removeWorkout(logId: number): Promise<void> {
  if (!(await initialize())) return;
  for (const recordType of ['ExerciseSession', 'ActiveCaloriesBurned'] as const) {
    await deleteRecordsByUuids(recordType, [], [savedWorkoutId(logId)]);
  }
}
