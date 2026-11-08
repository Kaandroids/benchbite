import {
  queryStatisticsForQuantity,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import {
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  requestPermission,
  revokeAllPermissions,
} from 'react-native-health-connect';

import * as android from './platform.android';
import * as ios from './platform.ios';

// The real modules, which every other test replaces with a stand-in (jest.setup-after-env.ts).
jest.unmock('./platform.ios');
jest.unmock('./platform.android');
jest.mock('@kingstinct/react-native-healthkit', () => ({
  isHealthDataAvailable: jest.fn(() => true),
  requestAuthorization: jest.fn(() => Promise.resolve(true)),
  queryStatisticsForQuantity: jest.fn(),
}));
jest.mock('react-native-health-connect', () => ({
  SdkAvailabilityStatus: {
    SDK_UNAVAILABLE: 1,
    SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2,
    SDK_AVAILABLE: 3,
  },
  getSdkStatus: jest.fn(),
  initialize: jest.fn(() => Promise.resolve(true)),
  requestPermission: jest.fn(() => Promise.resolve([])),
  getGrantedPermissions: jest.fn(),
  revokeAllPermissions: jest.fn(),
  aggregateRecord: jest.fn(),
}));

describe('Apple Health', () => {
  it('asks to read heart rate and active energy, and nothing to write', async () => {
    expect(await ios.requestAccess()).toBe(true);
    expect(requestAuthorization).toHaveBeenCalledWith({
      toRead: ['HKQuantityTypeIdentifierHeartRate', 'HKQuantityTypeIdentifierActiveEnergyBurned'],
    });
  });
});

const FROM = new Date('2026-11-08T18:04:00Z');
const TO = new Date('2026-11-08T18:56:00Z');

describe('Apple Health workouts', () => {
  it('reads the heart rate and calories for the time, with the source that measured them', async () => {
    jest
      .mocked(queryStatisticsForQuantity)
      .mockResolvedValueOnce({
        averageQuantity: { unit: 'count/min', quantity: 131.6 },
        maximumQuantity: { unit: 'count/min', quantity: 168 },
        sources: [{ name: 'Apple Watch', bundleIdentifier: 'com.apple.health' }],
      })
      .mockResolvedValueOnce({ sumQuantity: { unit: 'kcal', quantity: 411.7 }, sources: [] });

    expect(await ios.workoutStats(FROM, TO)).toEqual({
      averageBpm: 131.6,
      maxBpm: 168,
      activeKcal: 411.7,
      source: 'Apple Watch',
    });
    expect(queryStatisticsForQuantity).toHaveBeenCalledTimes(2);
  });
});

describe('Health Connect', () => {
  it('needs Google Play when missing or old, and is unavailable before Android 9', async () => {
    for (const [status, availability] of [
      [3, 'available'],
      [2, 'missing'],
      [1, 'unavailable'],
    ] as const) {
      jest.mocked(getSdkStatus).mockResolvedValue(status);
      expect(await android.availability()).toBe(availability);
    }
  });

  it('asks for heart rate and active calories, and counts as allowed with heart rate', async () => {
    jest
      .mocked(getGrantedPermissions)
      .mockResolvedValue([{ accessType: 'read', recordType: 'ActiveCaloriesBurned' }]);
    expect(await android.requestAccess()).toBe(false);
    expect(requestPermission).toHaveBeenCalledWith([
      { accessType: 'read', recordType: 'HeartRate' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
    ]);

    jest
      .mocked(getGrantedPermissions)
      .mockResolvedValue([{ accessType: 'read', recordType: 'HeartRate' }]);
    expect(await android.requestAccess()).toBe(true);
  });

  it('knows when heart rate was taken back', async () => {
    jest.mocked(getGrantedPermissions).mockResolvedValue([]);
    expect(await android.stillAllowed()).toBe(false);
  });

  it('gives up what was allowed', async () => {
    await android.releaseAccess();
    expect(revokeAllPermissions).toHaveBeenCalled();
  });

  it('reads only what may be read, and names the app that measured it', async () => {
    jest
      .mocked(getGrantedPermissions)
      .mockResolvedValue([{ accessType: 'read', recordType: 'HeartRate' }]);
    jest.mocked(aggregateRecord).mockResolvedValue({
      BPM_AVG: 131.6,
      BPM_MAX: 168,
      BPM_MIN: 90,
      MEASUREMENTS_COUNT: 300,
      dataOrigins: ['com.huami.watch.hmwatchmanager'],
    } as never);

    expect(await android.workoutStats(FROM, TO)).toEqual({
      averageBpm: 131.6,
      maxBpm: 168,
      activeKcal: null,
      source: 'Zepp',
    });
    expect(aggregateRecord).toHaveBeenCalledTimes(1);
  });

  it('keeps the calories when the heart rate cannot be read', async () => {
    jest.mocked(getGrantedPermissions).mockResolvedValue([
      { accessType: 'read', recordType: 'HeartRate' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
    ]);
    jest
      .mocked(aggregateRecord)
      .mockRejectedValueOnce(new Error('SecurityException'))
      .mockResolvedValueOnce({
        ACTIVE_CALORIES_TOTAL: { inKilocalories: 120 },
        dataOrigins: ['com.example.tracker'],
      } as never);

    expect(await android.workoutStats(FROM, TO)).toEqual({
      averageBpm: null,
      maxBpm: null,
      activeKcal: 120,
      source: 'com.example.tracker',
    });
  });
});
