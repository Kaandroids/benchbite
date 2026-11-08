import { requestAuthorization } from '@kingstinct/react-native-healthkit';
import {
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
}));

describe('Apple Health', () => {
  it('asks to read heart rate and active energy, and nothing to write', async () => {
    expect(await ios.requestAccess()).toBe(true);
    expect(requestAuthorization).toHaveBeenCalledWith({
      toRead: ['HKQuantityTypeIdentifierHeartRate', 'HKQuantityTypeIdentifierActiveEnergyBurned'],
    });
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
});
