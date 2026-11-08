// Health Connect: built into Android 14 and later, an app from Google Play on Android 9 to 13, and
// not available before.
import {
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  requestPermission,
  revokeAllPermissions,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';
import { Linking } from 'react-native';

import type { HealthAvailability, HealthStore } from './types';

const PERMISSIONS = [
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
] as const;

const PLAY_STORE = 'market://details?id=com.google.android.apps.healthdata';

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
