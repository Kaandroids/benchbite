// Apple Health, through HealthKit. Apple never tells an app whether it may read a type: a type it
// may not read simply has no data, so access counts as allowed once asked.
import { isHealthDataAvailable, requestAuthorization } from '@kingstinct/react-native-healthkit';

import type { HealthAvailability, HealthStore } from './types';

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
