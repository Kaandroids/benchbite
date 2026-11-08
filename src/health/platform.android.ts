// Health Connect: built into Android 14 and later, an app from Google Play on Android 9 to 13, and
// not available before.
import {
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  requestPermission,
  revokeAllPermissions,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';
import { Linking } from 'react-native';

import {
  NO_WORKOUT_STATS,
  type HealthAvailability,
  type HealthStore,
  type WorkoutStats,
} from './types';

const PERMISSIONS = [
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
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

/** Whether heart rate, the part a workout needs most, may be read. */
async function heartRateAllowed(): Promise<boolean> {
  const granted = await getGrantedPermissions();
  return granted.some(
    (permission) => permission.accessType === 'read' && permission.recordType === 'HeartRate',
  );
}

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
 * The workout's heart rate and active calories. Health Connect refuses to sum a type the app may
 * not read, so only the allowed ones are asked for, and one that fails leaves the other.
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
  const [heart, energy] = await Promise.allSettled([
    allowed('HeartRate')
      ? aggregateRecord({ recordType: 'HeartRate', timeRangeFilter })
      : Promise.resolve(null),
    allowed('ActiveCaloriesBurned')
      ? aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter })
      : Promise.resolve(null),
  ]);
  const measured =
    heart.status === 'fulfilled' && heart.value && heart.value.MEASUREMENTS_COUNT > 0
      ? heart.value
      : null;
  const kcal =
    energy.status === 'fulfilled' &&
    energy.value &&
    energy.value.ACTIVE_CALORIES_TOTAL.inKilocalories > 0
      ? energy.value
      : null;
  const origin = (measured ?? kcal)?.dataOrigins[0];
  return {
    averageBpm: measured?.BPM_AVG ?? null,
    maxBpm: measured?.BPM_MAX ?? null,
    activeKcal: kcal?.ACTIVE_CALORIES_TOTAL.inKilocalories ?? null,
    source: origin ? (APP_NAMES[origin] ?? origin) : null,
  };
}
