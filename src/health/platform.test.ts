import {
  queryQuantitySamples,
  queryStatisticsForQuantity,
  queryStatisticsForQuantitySeparateBySource,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import {
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  readRecords,
  requestPermission,
  revokeAllPermissions,
} from 'react-native-health-connect';

import * as android from './platform.android';
import * as ios from './platform.ios';
import { NO_WORKOUT_STATS } from './types';

// The real modules, which every other test replaces with a stand-in (jest.setup-after-env.ts).
jest.unmock('./platform.ios');
jest.unmock('./platform.android');
jest.mock('@kingstinct/react-native-healthkit', () => ({
  isHealthDataAvailable: jest.fn(() => true),
  requestAuthorization: jest.fn(() => Promise.resolve(true)),
  queryQuantitySamples: jest.fn(),
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
  aggregateRecord: jest.fn(),
  readRecords: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

describe('Apple Health', () => {
  it('asks to read heart rate, active energy and body mass, and nothing to write', async () => {
    expect(await ios.requestAccess()).toBe(true);
    expect(requestAuthorization).toHaveBeenCalledWith({
      toRead: [
        'HKQuantityTypeIdentifierHeartRate',
        'HKQuantityTypeIdentifierActiveEnergyBurned',
        'HKQuantityTypeIdentifierBodyMass',
      ],
    });
  });

  it('asks for body mass alone, for a connection made before weight was read', async () => {
    expect(await ios.requestWeightAccess()).toBe(true);
    expect(requestAuthorization).toHaveBeenCalledWith({
      toRead: ['HKQuantityTypeIdentifierBodyMass'],
    });
  });

  it('reads the weighings in kilograms, with the app that wrote them', async () => {
    const at = new Date('2026-11-08T06:12:00Z');
    jest.mocked(queryQuantitySamples).mockResolvedValue([
      { startDate: at, quantity: 84.4, sourceRevision: { source: { name: 'Withings' } } },
      { startDate: at, quantity: 84.2, sourceRevision: { source: { name: '' } } },
    ] as never);

    expect(await ios.weightsSince(FROM)).toEqual([
      { at, weightKg: 84.4, source: 'Withings' },
      { at, weightKg: 84.2, source: null },
    ]);
    expect(queryQuantitySamples).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierBodyMass',
      expect.objectContaining({ unit: 'kg', filter: { date: { startDate: FROM } } }),
    );
  });
});

const FROM = new Date('2026-11-08T18:04:00Z');
const TO = new Date('2026-11-08T18:56:00Z');

describe('Apple Health workouts', () => {
  it('reads the heart rate, and the calories of the apps that measured it', async () => {
    jest.mocked(queryStatisticsForQuantity).mockResolvedValue({
      averageQuantity: { unit: 'count/min', quantity: 131.6 },
      maximumQuantity: { unit: 'count/min', quantity: 168 },
      sources: [{ name: 'Apple Watch', bundleIdentifier: 'com.apple.health.watch' }],
    });
    jest.mocked(queryStatisticsForQuantitySeparateBySource).mockResolvedValue([
      {
        sumQuantity: { unit: 'kcal', quantity: 411.7 },
        source: { name: 'Apple Watch', bundleIdentifier: 'com.apple.health.watch' },
      },
      {
        sumQuantity: { unit: 'kcal', quantity: 6 },
        source: { name: 'iPhone', bundleIdentifier: 'com.apple.health.phone' },
      },
    ]);

    expect(await ios.workoutStats(FROM, TO)).toEqual({
      heartRate: { average: 131.6, max: 168 },
      activeKcal: 411.7,
      source: 'Apple Watch',
    });
  });

  it('keeps no calories that only the phone counted', async () => {
    jest.mocked(queryStatisticsForQuantity).mockResolvedValue({
      averageQuantity: { unit: 'count/min', quantity: 120 },
      maximumQuantity: { unit: 'count/min', quantity: 150 },
      sources: [{ name: 'Zepp', bundleIdentifier: 'com.huami.zepp' }],
    });
    jest.mocked(queryStatisticsForQuantitySeparateBySource).mockResolvedValue([
      {
        sumQuantity: { unit: 'kcal', quantity: 6 },
        source: { name: 'iPhone', bundleIdentifier: 'com.apple.health.phone' },
      },
    ]);

    expect((await ios.workoutStats(FROM, TO)).activeKcal).toBeNull();
  });

  it('finds nothing without a heart rate', async () => {
    jest.mocked(queryStatisticsForQuantity).mockResolvedValue({ sources: [] });

    expect(await ios.workoutStats(FROM, TO)).toEqual(NO_WORKOUT_STATS);
    expect(queryStatisticsForQuantitySeparateBySource).not.toHaveBeenCalled();
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
      { accessType: 'read', recordType: 'Weight' },
    ]);

    jest
      .mocked(getGrantedPermissions)
      .mockResolvedValue([{ accessType: 'read', recordType: 'HeartRate' }]);
    expect(await android.requestAccess()).toBe(true);
  });

  it('asks for weight alone, and says whether it was allowed', async () => {
    jest.mocked(getGrantedPermissions).mockResolvedValue([]);
    expect(await android.requestWeightAccess()).toBe(false);
    expect(requestPermission).toHaveBeenCalledWith([{ accessType: 'read', recordType: 'Weight' }]);
  });

  it('reads the weighings in kilograms, with the app that wrote them', async () => {
    jest
      .mocked(getGrantedPermissions)
      .mockResolvedValue([{ accessType: 'read', recordType: 'Weight' }]);
    jest.mocked(readRecords).mockResolvedValue({
      records: [
        {
          time: '2026-11-08T06:12:00Z',
          weight: { inKilograms: 84.4 },
          metadata: { dataOrigin: 'com.huami.watch.hmwatchmanager' },
        },
      ],
    } as never);

    expect(await android.weightsSince(FROM)).toEqual([
      { at: new Date('2026-11-08T06:12:00Z'), weightKg: 84.4, source: 'Zepp' },
    ]);
  });

  it('reads no weight when it may not be read', async () => {
    jest.mocked(getGrantedPermissions).mockResolvedValue([]);
    expect(await android.weightsSince(FROM)).toEqual([]);
    expect(readRecords).not.toHaveBeenCalled();
  });

  it('knows when heart rate was taken back', async () => {
    jest.mocked(getGrantedPermissions).mockResolvedValue([]);
    expect(await android.stillAllowed()).toBe(false);
  });

  it('gives up what was allowed', async () => {
    await android.releaseAccess();
    expect(revokeAllPermissions).toHaveBeenCalled();
  });

  it('reads the heart rate, and the calories of the apps that measured it', async () => {
    jest.mocked(getGrantedPermissions).mockResolvedValue([
      { accessType: 'read', recordType: 'HeartRate' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
    ]);
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
      heartRate: { average: 131.6, max: 168 },
      activeKcal: 411.7,
      source: 'Zepp',
    });
    expect(jest.mocked(aggregateRecord).mock.calls[1]![0]).toMatchObject({
      recordType: 'ActiveCaloriesBurned',
      dataOriginFilter: ['com.huami.watch.hmwatchmanager'],
    });
  });

  it('keeps the heart rate when the calories cannot be read', async () => {
    jest.mocked(getGrantedPermissions).mockResolvedValue([
      { accessType: 'read', recordType: 'HeartRate' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
    ]);
    jest
      .mocked(aggregateRecord)
      .mockResolvedValueOnce({
        BPM_AVG: 120,
        BPM_MAX: 150,
        BPM_MIN: 90,
        MEASUREMENTS_COUNT: 10,
        dataOrigins: ['com.example.tracker'],
      } as never)
      .mockRejectedValueOnce(new Error('SecurityException'));

    expect(await android.workoutStats(FROM, TO)).toEqual({
      heartRate: { average: 120, max: 150 },
      activeKcal: null,
      source: 'com.example.tracker',
    });
  });

  it('reads nothing when heart rate may not be read', async () => {
    jest
      .mocked(getGrantedPermissions)
      .mockResolvedValue([{ accessType: 'read', recordType: 'ActiveCaloriesBurned' }]);

    expect(await android.workoutStats(FROM, TO)).toEqual(NO_WORKOUT_STATS);
    expect(aggregateRecord).not.toHaveBeenCalled();
  });
});
