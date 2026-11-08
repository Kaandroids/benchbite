// Health Connect: built into Android 14 and later, an app from Google Play on Android 9 to 13, and
// not available before.
import {
  aggregateGroupByPeriod,
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  readRecords,
  requestPermission,
  revokeAllPermissions,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';
import { Linking } from 'react-native';

import { heartRateSamples, type HeartRatePoint } from './samples';
import {
  NO_WORKOUT_STATS,
  type HealthAvailability,
  type HealthStore,
  type StepDay,
  type WeightReading,
  type WorkoutStats,
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
    samples: heartRateSamples(await heartRatePoints(timeRangeFilter), from, to),
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

/** Every heart rate sample between two times, page by page; a workout has a few thousand at most. */
async function heartRatePoints(timeRangeFilter: {
  operator: 'between';
  startTime: string;
  endTime: string;
}): Promise<HeartRatePoint[]> {
  const points: HeartRatePoint[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
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
