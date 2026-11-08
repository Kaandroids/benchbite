// Health Connect: built into Android 14 and later, an app from Google Play on Android 9 to 13, and
// not available before.
import {
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

import {
  NO_WORKOUT_STATS,
  type HealthAvailability,
  type HealthStore,
  type WeightReading,
  type WorkoutStats,
} from './types';

const PERMISSIONS = [
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'Weight' },
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
  const origin = heart.dataOrigins[0];
  return {
    heartRate: { average: heart.BPM_AVG, max: heart.BPM_MAX },
    activeKcal,
    source: origin ? (APP_NAMES[origin] ?? origin) : null,
  };
}

export const weightAllowed = () => allowedToRead('Weight');

export async function requestWeightAccess(): Promise<boolean> {
  if (!(await initialize())) return false;
  await requestPermission([{ accessType: 'read', recordType: 'Weight' }]);
  return weightAllowed();
}

export async function weightsSince(from: Date): Promise<WeightReading[]> {
  if (!(await initialize()) || !(await allowedToRead('Weight'))) return [];
  const { records } = await readRecords('Weight', {
    timeRangeFilter: { operator: 'after', startTime: from.toISOString() },
    ascendingOrder: true,
    pageSize: 1000,
  });
  return records.map((record) => {
    const origin = record.metadata?.dataOrigin;
    return {
      at: new Date(record.time),
      weightKg: record.weight.inKilograms,
      source: origin ? (APP_NAMES[origin] ?? origin) : null,
    };
  });
}
