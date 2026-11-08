import {
  queryStatisticsForQuantity,
  queryStatisticsForQuantitySeparateBySource,
} from '@kingstinct/react-native-healthkit';
import { aggregateRecord, getGrantedPermissions, getSdkStatus } from 'react-native-health-connect';

import * as android from './platform.android';
import * as ios from './platform.ios';

jest.mock('@kingstinct/react-native-healthkit', () => ({
  isHealthDataAvailable: jest.fn(() => true),
  requestAuthorization: jest.fn(() => Promise.resolve(true)),
  queryStatisticsForQuantity: jest.fn(),
  queryStatisticsForQuantitySeparateBySource: jest.fn(),
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
  openHealthConnectSettings: jest.fn(),
  aggregateRecord: jest.fn(),
}));

const FROM = new Date('2026-11-08T18:04:00Z');
const TO = new Date('2026-11-08T18:56:00Z');

describe('Apple Health', () => {
  it('reads the average and highest heart rate and the calories, rounded, with the watch', async () => {
    jest
      .mocked(queryStatisticsForQuantity)
      .mockResolvedValueOnce({
        averageQuantity: { unit: 'count/min', quantity: 131.6 },
        maximumQuantity: { unit: 'count/min', quantity: 168 },
        sources: [],
      })
      .mockResolvedValueOnce({ sumQuantity: { unit: 'kcal', quantity: 411.7 }, sources: [] });
    jest
      .mocked(queryStatisticsForQuantitySeparateBySource)
      .mockResolvedValue([
        { source: { name: 'Apple Watch', bundleIdentifier: 'com.apple.health' } },
      ]);

    expect(await ios.workoutStats(FROM, TO)).toEqual({
      averageBpm: 132,
      maxBpm: 168,
      activeKcal: 412,
      source: 'Apple Watch',
    });
    expect(queryStatisticsForQuantity).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierHeartRate',
      ['discreteAverage', 'discreteMax'],
      { filter: { date: { startDate: FROM, endDate: TO } }, unit: 'count/min' },
    );
  });

  it('finds nothing when nothing was measured', async () => {
    jest.mocked(queryStatisticsForQuantity).mockResolvedValue({ sources: [] });
    jest.mocked(queryStatisticsForQuantitySeparateBySource).mockResolvedValue([]);

    expect(await ios.workoutStats(FROM, TO)).toEqual({
      averageBpm: null,
      maxBpm: null,
      activeKcal: null,
      source: null,
    });
  });
});

describe('Health Connect', () => {
  it('tells whether it is installed, or needs an update', async () => {
    for (const [status, availability] of [
      [3, 'available'],
      [2, 'updateRequired'],
      [1, 'notInstalled'],
    ] as const) {
      jest.mocked(getSdkStatus).mockResolvedValue(status);
      expect(await android.availability()).toBe(availability);
    }
  });

  it('counts as allowed only when heart rate may be read', async () => {
    jest
      .mocked(getGrantedPermissions)
      .mockResolvedValue([{ accessType: 'read', recordType: 'ActiveCaloriesBurned' }]);
    expect(await android.requestAccess()).toBe(false);

    jest
      .mocked(getGrantedPermissions)
      .mockResolvedValue([{ accessType: 'read', recordType: 'HeartRate' }]);
    expect(await android.requestAccess()).toBe(true);
  });

  it('reads the heart rate and calories, naming the app that measured them', async () => {
    jest
      .mocked(aggregateRecord)
      .mockResolvedValueOnce({
        BPM_AVG: 131.6,
        BPM_MAX: 168,
        BPM_MIN: 90,
        MEASUREMENTS_COUNT: 300,
        dataOrigins: ['com.huami.watch.hmwatchmanager'],
      } as never)
      .mockResolvedValueOnce({
        ACTIVE_CALORIES_TOTAL: { inKilocalories: 411.7 },
        dataOrigins: ['com.huami.watch.hmwatchmanager'],
      } as never);

    expect(await android.workoutStats(FROM, TO)).toEqual({
      averageBpm: 132,
      maxBpm: 168,
      activeKcal: 412,
      source: 'Zepp',
    });
  });

  it('finds no heart rate without measurements, and names an unknown app by its package', async () => {
    jest
      .mocked(aggregateRecord)
      .mockResolvedValueOnce({
        BPM_AVG: 0,
        BPM_MAX: 0,
        BPM_MIN: 0,
        MEASUREMENTS_COUNT: 0,
        dataOrigins: [],
      } as never)
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
