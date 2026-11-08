// Health Connect, built into Android 14 and later, and an app from Google Play before that.
import {
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  requestPermission,
  revokeAllPermissions,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';
import { Linking } from 'react-native';

import type { HealthAvailability, HealthStore, WorkoutStats } from './health';

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
  if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return 'available';
  if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
    return 'updateRequired';
  }
  return 'notInstalled';
}

export async function requestAccess(): Promise<boolean> {
  if (!(await initialize())) return false;
  await requestPermission([...PERMISSIONS]);
  const granted = await getGrantedPermissions();
  return granted.some(
    (permission) => permission.accessType === 'read' && permission.recordType === 'HeartRate',
  );
}

export async function releaseAccess(): Promise<void> {
  if (await initialize()) {
    await revokeAllPermissions();
  }
}

export function openStore(availability: HealthAvailability): void {
  if (availability === 'available') {
    openHealthConnectSettings();
  } else {
    void Linking.openURL(PLAY_STORE);
  }
}

export async function workoutStats(from: Date, to: Date): Promise<WorkoutStats> {
  await initialize();
  const timeRangeFilter = {
    operator: 'between' as const,
    startTime: from.toISOString(),
    endTime: to.toISOString(),
  };
  const [heart, energy] = await Promise.all([
    aggregateRecord({ recordType: 'HeartRate', timeRangeFilter }),
    aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter }),
  ]);
  const measured = heart.MEASUREMENTS_COUNT > 0;
  const kcal = energy.ACTIVE_CALORIES_TOTAL.inKilocalories;
  const origin = (measured ? heart.dataOrigins : energy.dataOrigins)[0];
  return {
    averageBpm: measured ? Math.round(heart.BPM_AVG) : null,
    maxBpm: measured ? Math.round(heart.BPM_MAX) : null,
    activeKcal: kcal > 0 ? Math.round(kcal) : null,
    source: origin ? (APP_NAMES[origin] ?? origin) : null,
  };
}
