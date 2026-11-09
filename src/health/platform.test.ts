import {
  authorizationStatusFor,
  deleteObjects,
  queryQuantitySamples,
  queryStatisticsCollectionForQuantity,
  queryStatisticsForQuantity,
  queryStatisticsForQuantitySeparateBySource,
  queryWorkoutSamples,
  requestAuthorization,
  saveWorkoutSample,
} from '@kingstinct/react-native-healthkit';
import {
  aggregateGroupByPeriod,
  aggregateRecord,
  deleteRecordsByUuids,
  getGrantedPermissions,
  getSdkStatus,
  insertRecords,
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
jest.mock('expo-application', () => ({ applicationId: 'com.benchbite.app' }));
jest.mock('@kingstinct/react-native-healthkit', () => ({
  AuthorizationStatus: { notDetermined: 0, sharingDenied: 1, sharingAuthorized: 2 },
  ComparisonPredicateOperator: { equalTo: 4 },
  WorkoutActivityType: {
    traditionalStrengthTraining: 50,
    running: 37,
    50: 'traditionalStrengthTraining',
    37: 'running',
    3000: 'other',
  },
  authorizationStatusFor: jest.fn(),
  deleteObjects: jest.fn(() => Promise.resolve(0)),
  queryWorkoutSamples: jest.fn(),
  saveWorkoutSample: jest.fn(() => Promise.resolve()),
  isHealthDataAvailable: jest.fn(() => true),
  requestAuthorization: jest.fn(() => Promise.resolve(true)),
  queryQuantitySamples: jest.fn(),
  queryStatisticsCollectionForQuantity: jest.fn(),
  queryStatisticsForQuantity: jest.fn(),
  queryStatisticsForQuantitySeparateBySource: jest.fn(),
}));
jest.mock('react-native-health-connect', () => ({
  ExerciseType: { STRENGTH_TRAINING: 70, BIKING: 8, OTHER_WORKOUT: 0 },
  insertRecords: jest.fn(() => Promise.resolve([])),
  deleteRecordsByUuids: jest.fn(() => Promise.resolve()),
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
  aggregateGroupByPeriod: jest.fn(),
  readRecords: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

describe('Apple Health', () => {
  it('asks to read heart rate, active energy, body mass, steps and workouts, and nothing to write', async () => {
    expect(await ios.requestAccess()).toBe(true);
    expect(requestAuthorization).toHaveBeenCalledWith({
      toRead: [
        'HKQuantityTypeIdentifierHeartRate',
        'HKQuantityTypeIdentifierActiveEnergyBurned',
        'HKQuantityTypeIdentifierBodyMass',
        'HKQuantityTypeIdentifierStepCount',
        'HKWorkoutTypeIdentifier',
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

    jest.mocked(queryQuantitySamples).mockResolvedValue([
      { startDate: new Date(FROM.getTime() + 2_000), quantity: 118 },
      { startDate: new Date(FROM.getTime() + 7_000), quantity: 122 },
      { startDate: new Date(FROM.getTime() + 25_000), quantity: 140 },
    ] as never);

    const stats = await ios.workoutStats(FROM, TO);
    expect(stats).toMatchObject({
      heartRate: { average: 131.6, max: 168 },
      activeKcal: 411.7,
      source: 'Apple Watch',
    });
    // One value every 10 seconds of the 52 minutes, the average of the samples in them.
    expect(stats.samples).toHaveLength(313);
    expect(stats.samples?.slice(0, 3)).toEqual([120, null, 140]);
  });

  it('keeps the heart rate when its samples cannot be read', async () => {
    jest.mocked(queryStatisticsForQuantity).mockResolvedValue({
      averageQuantity: { unit: 'count/min', quantity: 120 },
      maximumQuantity: { unit: 'count/min', quantity: 150 },
      sources: [{ name: 'Zepp', bundleIdentifier: 'com.huami.zepp' }],
    });
    jest.mocked(queryStatisticsForQuantitySeparateBySource).mockResolvedValue([]);
    jest.mocked(queryQuantitySamples).mockRejectedValue(new Error('denied'));

    expect(await ios.workoutStats(FROM, TO)).toMatchObject({
      heartRate: { average: 120, max: 150 },
      samples: null,
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

  it('asks for its five types, and counts as allowed with heart rate', async () => {
    jest
      .mocked(getGrantedPermissions)
      .mockResolvedValue([{ accessType: 'read', recordType: 'ActiveCaloriesBurned' }]);
    expect(await android.requestAccess()).toBe(false);
    expect(requestPermission).toHaveBeenCalledWith([
      { accessType: 'read', recordType: 'HeartRate' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
      { accessType: 'read', recordType: 'Weight' },
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'ExerciseSession' },
    ]);

    jest
      .mocked(getGrantedPermissions)
      .mockResolvedValue([{ accessType: 'read', recordType: 'HeartRate' }]);
    expect(await android.requestAccess()).toBe(true);
  });

  it('knows whether weight was allowed', async () => {
    jest
      .mocked(getGrantedPermissions)
      .mockResolvedValue([{ accessType: 'read', recordType: 'HeartRate' }]);
    expect(await android.weightAllowed()).toBe(false);
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

    jest.mocked(readRecords).mockResolvedValue({
      records: [
        {
          samples: [
            { time: new Date(FROM.getTime() + 3_000).toISOString(), beatsPerMinute: 130 },
            { time: new Date(FROM.getTime() + 12_000).toISOString(), beatsPerMinute: 140 },
          ],
        },
      ],
    } as never);

    const stats = await android.workoutStats(FROM, TO);
    expect(stats).toMatchObject({
      heartRate: { average: 131.6, max: 168 },
      activeKcal: 411.7,
      source: 'Zepp',
    });
    expect(stats.samples?.slice(0, 3)).toEqual([130, 140, null]);
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

    jest.mocked(readRecords).mockResolvedValue({ records: [] } as never);

    expect(await android.workoutStats(FROM, TO)).toEqual({
      heartRate: { average: 120, max: 150 },
      activeKcal: null,
      source: 'com.example.tracker',
      samples: null,
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

describe('steps', () => {
  const from = new Date(2026, 10, 1);
  const to = new Date(2026, 10, 8, 9, 0);

  it('reads one sum a day from Apple Health, leaving out days without steps', async () => {
    jest.mocked(queryStatisticsCollectionForQuantity).mockResolvedValue([
      {
        startDate: new Date(2026, 10, 7),
        sumQuantity: { unit: 'count', quantity: 11340 },
        sources: [],
      },
      { startDate: new Date(2026, 10, 8), sources: [] },
    ] as never);

    expect(await ios.dailySteps(from, to)).toEqual([{ day: '2026-11-07', steps: 11340 }]);
    expect(queryStatisticsCollectionForQuantity).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierStepCount',
      ['cumulativeSum'],
      from,
      { day: 1 },
      { filter: { date: { startDate: from, endDate: to } }, unit: 'count' },
    );
  });

  it("reads one total a day from Health Connect, by the phone's day", async () => {
    jest
      .mocked(getGrantedPermissions)
      .mockResolvedValue([{ accessType: 'read', recordType: 'Steps' }]);
    jest.mocked(aggregateGroupByPeriod).mockResolvedValue([
      {
        startTime: '2026-11-07T00:00',
        endTime: '2026-11-08T00:00',
        result: { COUNT_TOTAL: 9100, dataOrigins: ['com.google.android.apps.fitness'] },
      },
      {
        startTime: '2026-11-08T00:00',
        endTime: '2026-11-08T09:00',
        result: { COUNT_TOTAL: 0, dataOrigins: [] },
      },
    ] as never);

    expect(await android.dailySteps(from, to)).toEqual([{ day: '2026-11-07', steps: 9100 }]);
    expect(jest.mocked(aggregateGroupByPeriod).mock.calls[0]![0]).toMatchObject({
      recordType: 'Steps',
      timeRangeSlicer: { period: 'DAYS', length: 1 },
    });
  });

  it('reads no steps from Health Connect when they may not be read', async () => {
    jest.mocked(getGrantedPermissions).mockResolvedValue([]);

    expect(await android.dailySteps(from, to)).toEqual([]);
    expect(aggregateGroupByPeriod).not.toHaveBeenCalled();
  });
});

describe('saving workouts', () => {
  const start = new Date('2026-11-09T18:05:00Z');
  const end = new Date('2026-11-09T18:45:00Z');
  const workout = { logId: 11, start, end, activeKcal: 395 };
  const savedBy = (
    id?: string,
    kcal?: number,
    from = start,
    to = end,
    app = id ? 'com.benchbite.app' : 'com.apple.health',
  ) => ({
    startDate: from,
    endDate: to,
    sourceRevision: { source: { bundleIdentifier: app } },
    metadata: {
      ...(id ? { HKExternalUUID: id } : {}),
      ...(kcal !== undefined ? { BenchbiteActiveKcal: kcal } : {}),
    },
  });

  it('asks Apple Health to write workouts and active energy, and knows when it may', async () => {
    jest.mocked(authorizationStatusFor).mockReturnValue(2 as never);
    expect(await ios.requestWriteAccess()).toBe(true);
    expect(requestAuthorization).toHaveBeenCalledWith({
      toShare: ['HKWorkoutTypeIdentifier', 'HKQuantityTypeIdentifierActiveEnergyBurned'],
      toRead: ['HKWorkoutTypeIdentifier'],
    });
    jest.mocked(authorizationStatusFor).mockReturnValue(1 as never);
    expect(await ios.writeAllowed()).toBe(false);
  });

  it('counts writing as not allowed in Apple Health with workouts allowed but not energy', async () => {
    jest
      .mocked(authorizationStatusFor)
      .mockImplementation((type) => (type === 'HKWorkoutTypeIdentifier' ? 2 : 1) as never);
    expect(await ios.writeAllowed()).toBe(false);
  });

  it('saves a strength workout to Apple Health with its calories, in place of its copy', async () => {
    await ios.saveWorkout(workout);
    expect(deleteObjects).toHaveBeenCalledWith('HKWorkoutTypeIdentifier', {
      metadata: { withMetadataKey: 'HKExternalUUID', operatorType: 4, value: 'benchbite-log-11' },
    });
    expect(saveWorkoutSample).toHaveBeenCalledWith(
      50,
      [
        {
          quantityType: 'HKQuantityTypeIdentifierActiveEnergyBurned',
          quantity: 395,
          unit: 'kcal',
          startDate: start,
          endDate: end,
        },
      ],
      start,
      end,
      { energyBurned: 395 },
      { HKExternalUUID: 'benchbite-log-11', BenchbiteActiveKcal: 395 },
    );
  });

  it('finds its own copy and other apps’ workouts in Apple Health', async () => {
    jest
      .mocked(queryWorkoutSamples)
      .mockResolvedValue([savedBy('benchbite-log-11', 395), savedBy()] as never);
    expect(await ios.storedWorkouts(11, start, end)).toEqual({
      ours: { activeKcal: 395 },
      others: true,
    });
    jest.mocked(queryWorkoutSamples).mockResolvedValue([savedBy('benchbite-log-10')] as never);
    expect(await ios.storedWorkouts(11, start, end)).toEqual({ ours: null, others: false });
  });

  it('counts a workout of another app in Apple Health as its own, whatever id it carries', async () => {
    const copied = savedBy('benchbite-log-11', 395, start, end, 'com.example.other');
    jest.mocked(queryWorkoutSamples).mockResolvedValue([copied] as never);
    expect(await ios.storedWorkouts(11, start, end)).toEqual({ ours: null, others: true });
  });

  it('counts no workout of another app in Apple Health that only touches the log’s time', async () => {
    const run = savedBy(
      undefined,
      undefined,
      new Date('2026-11-09T17:30:00Z'),
      new Date('2026-11-09T18:10:00Z'),
    );
    jest.mocked(queryWorkoutSamples).mockResolvedValue([run] as never);
    expect(await ios.storedWorkouts(11, start, end)).toEqual({ ours: null, others: false });
  });

  it('asks Health Connect to write exercise and calories, and to read exercise', async () => {
    jest.mocked(getGrantedPermissions).mockResolvedValue([
      { accessType: 'write', recordType: 'ExerciseSession' },
      { accessType: 'write', recordType: 'ActiveCaloriesBurned' },
    ] as never);
    expect(await android.requestWriteAccess()).toBe(true);
    expect(requestPermission).toHaveBeenCalledWith([
      { accessType: 'write', recordType: 'ExerciseSession' },
      { accessType: 'write', recordType: 'ActiveCaloriesBurned' },
      { accessType: 'read', recordType: 'ExerciseSession' },
    ]);
  });

  it('counts writing as not allowed in Health Connect with exercise allowed but not calories', async () => {
    jest
      .mocked(getGrantedPermissions)
      .mockResolvedValue([{ accessType: 'write', recordType: 'ExerciseSession' }] as never);
    expect(await android.writeAllowed()).toBe(false);
  });

  it('saves a strength session to Health Connect under the log’s id, which replaces its copy', async () => {
    await android.saveWorkout(workout);
    const metadata = {
      clientRecordId: 'benchbite-log-11',
      clientRecordVersion: expect.any(Number),
    };
    expect(insertRecords).toHaveBeenCalledWith([
      {
        recordType: 'ExerciseSession',
        exerciseType: 70,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        metadata,
      },
      {
        recordType: 'ActiveCaloriesBurned',
        energy: { unit: 'kilocalories', value: 395 },
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        metadata,
      },
    ]);
    expect(deleteRecordsByUuids).not.toHaveBeenCalled();
  });

  it('takes out the calories of a copy saved again without any', async () => {
    await android.saveWorkout({ ...workout, activeKcal: null });
    expect(insertRecords).toHaveBeenCalledWith([expect.objectContaining({ exerciseType: 70 })]);
    expect(deleteRecordsByUuids).toHaveBeenCalledWith(
      'ActiveCaloriesBurned',
      [],
      ['benchbite-log-11'],
    );
  });

  const session = (
    clientRecordId?: string,
    from = start,
    to = end,
    dataOrigin = clientRecordId ? 'com.benchbite.app' : 'com.garmin.android.apps.connectmobile',
  ) => ({
    startTime: from.toISOString(),
    endTime: to.toISOString(),
    metadata: { dataOrigin, ...(clientRecordId ? { clientRecordId } : {}) },
  });

  it('finds its own copy, with its calories, and other apps’ sessions in Health Connect', async () => {
    const own = session('benchbite-log-11');
    jest
      .mocked(readRecords)
      .mockResolvedValueOnce({ records: [own, session()] } as never)
      .mockResolvedValueOnce({
        records: [{ ...own, energy: { inKilocalories: 395 } }],
      } as never);
    expect(await android.storedWorkouts(11, start, end)).toEqual({
      ours: { activeKcal: 395 },
      others: true,
    });
  });

  it('counts a session of another app in Health Connect as its own, whatever id it carries', async () => {
    jest.mocked(readRecords).mockResolvedValueOnce({
      records: [session('benchbite-log-11', start, end, 'com.example.other')],
    } as never);
    expect(await android.storedWorkouts(11, start, end)).toEqual({ ours: null, others: true });
  });

  it('counts its copies of other logs in Health Connect as no other app’s', async () => {
    jest
      .mocked(readRecords)
      .mockResolvedValueOnce({ records: [session('benchbite-log-10')] } as never);
    expect(await android.storedWorkouts(11, start, end)).toEqual({ ours: null, others: false });
  });

  it('counts a session of another app in Health Connect that covers most of the log’s time', async () => {
    jest.mocked(readRecords).mockResolvedValueOnce({
      records: [
        session(undefined, new Date('2026-11-09T18:00:00Z'), new Date('2026-11-09T18:30:00Z')),
      ],
    } as never);
    expect(await android.storedWorkouts(11, start, end)).toEqual({ ours: null, others: true });
  });

  it('takes its copy out of Health Connect', async () => {
    await android.removeWorkout(11);
    expect(deleteRecordsByUuids).toHaveBeenCalledWith('ExerciseSession', [], ['benchbite-log-11']);
    expect(deleteRecordsByUuids).toHaveBeenCalledWith(
      'ActiveCaloriesBurned',
      [],
      ['benchbite-log-11'],
    );
  });
});

describe('workouts from other apps', () => {
  const from = new Date('2026-11-01T00:00:00Z');
  const to = new Date('2026-11-10T00:00:00Z');
  const start = new Date('2026-11-09T07:10:00Z');
  const end = new Date('2026-11-09T07:42:00Z');

  it('reads Apple Health’s workouts of other apps, with their heart rate, as an activity', async () => {
    const workout = (app: string, type: number, at = start) => ({
      uuid: `${app}-${type}`,
      workoutActivityType: type,
      startDate: at,
      endDate: end,
      totalEnergyBurned: { unit: 'kcal', quantity: 310 },
      sourceRevision: { source: { bundleIdentifier: app, name: 'Apple Watch' } },
    });
    jest
      .mocked(queryWorkoutSamples)
      .mockResolvedValue([
        workout('com.apple.health', 37),
        workout('com.apple.health', 3000),
        workout('com.benchbite.app', 50),
        workout('com.apple.health', 37, new Date('2026-10-31T23:30:00Z')),
      ] as never);
    jest.mocked(queryStatisticsForQuantity).mockResolvedValue({
      averageQuantity: { unit: 'count/min', quantity: 148 },
    } as never);

    expect(await ios.outsideWorkouts(from, to)).toEqual([
      {
        id: 'com.apple.health-37',
        activity: 'running',
        start,
        end,
        activeKcal: 310,
        heartRateAvg: 148,
        source: 'Apple Watch',
      },
      {
        id: 'com.apple.health-3000',
        activity: 'other',
        start,
        end,
        activeKcal: 310,
        heartRateAvg: 148,
        source: 'Apple Watch',
      },
    ]);
  });

  it('reads Health Connect’s sessions of other apps, with the calories of the app that recorded each', async () => {
    jest.mocked(getGrantedPermissions).mockResolvedValue([
      { accessType: 'read', recordType: 'ExerciseSession' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
      { accessType: 'read', recordType: 'HeartRate' },
    ] as never);
    const session = (origin: string, type: number) => ({
      exerciseType: type,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      metadata: { id: `${origin}-${type}`, dataOrigin: origin },
    });
    jest.mocked(readRecords).mockResolvedValueOnce({
      records: [session('com.huami.watch.hmwatchmanager', 8), session('com.benchbite.app', 70)],
    } as never);
    jest
      .mocked(aggregateRecord)
      .mockResolvedValueOnce({ ACTIVE_CALORIES_TOTAL: { inKilocalories: 540 } } as never)
      .mockResolvedValueOnce({ MEASUREMENTS_COUNT: 900, BPM_AVG: 132 } as never);

    expect(await android.outsideWorkouts(from, to)).toEqual([
      {
        id: 'com.huami.watch.hmwatchmanager-8',
        activity: 'cycling',
        start,
        end,
        activeKcal: 540,
        heartRateAvg: 132,
        source: 'Zepp',
      },
    ]);
    expect(aggregateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        recordType: 'ActiveCaloriesBurned',
        dataOriginFilter: ['com.huami.watch.hmwatchmanager'],
      }),
    );
  });

  it('reads no sessions from Health Connect while they may not be read', async () => {
    jest.mocked(getGrantedPermissions).mockResolvedValue([] as never);
    expect(await android.outsideWorkouts(from, to)).toEqual([]);
    expect(readRecords).not.toHaveBeenCalled();
  });
});
