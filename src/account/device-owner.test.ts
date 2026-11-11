import { isHealthConnected, setHealthConnected } from '@/health/connection';
import { releaseHealthAccess } from '@/health/health';
import { cancelReminders } from '@/reminders/reminders';
import { loadReminderMinutes, saveReminderMinutes } from '@/reminders/settings';
import { endSession, forgetEndedSessions } from '@/sessions/session';

import { claimDevice } from './device-owner';

jest.mock('expo-sqlite/kv-store', () => {
  const items = new Map<string, string>();
  return {
    Storage: {
      getItemSync: (key: string) => items.get(key) ?? null,
      setItemSync: (key: string, value: string) => void items.set(key, value),
      removeItemSync: (key: string) => void items.delete(key),
      clearSync: () => items.clear(),
    },
  };
});
jest.mock('@/providers/session-provider', () => ({ useUserId: jest.fn() }));
jest.mock('@/reminders/reminders', () => ({ cancelReminders: jest.fn() }));
jest.mock('@/sessions/session', () => ({ endSession: jest.fn(), forgetEndedSessions: jest.fn() }));
jest.mock('@/health/health', () => ({ releaseHealthAccess: jest.fn() }));

const { Storage } = jest.requireMock<{ Storage: { clearSync: () => void } }>(
  'expo-sqlite/kv-store',
);

beforeEach(() => {
  jest.clearAllMocks();
  Storage.clearSync();
  jest.mocked(cancelReminders).mockResolvedValue();
  saveReminderMinutes(1080);
  setHealthConnected(true);
});

describe('claimDevice', () => {
  it('keeps everything for the user who owns the device', () => {
    claimDevice('user-1');
    claimDevice('user-1');
    expect(endSession).not.toHaveBeenCalled();
    expect(cancelReminders).not.toHaveBeenCalled();
    expect(loadReminderMinutes()).toBe(1080);
    expect(isHealthConnected()).toBe(true);
  });

  it('drops the previous user’s workout in progress, reminders and health connection for another user', () => {
    claimDevice('user-1');
    claimDevice('user-2');
    expect(endSession).toHaveBeenCalledWith({ saved: false });
    // How the previous user's workouts ended goes too, as it would reach the next user's watch.
    expect(forgetEndedSessions).toHaveBeenCalledTimes(1);
    expect(cancelReminders).toHaveBeenCalledTimes(1);
    expect(loadReminderMinutes()).toBeNull();
    expect(isHealthConnected()).toBe(false);
    // Health Connect would take it back only at the next start, with what the new user allowed.
    expect(releaseHealthAccess).not.toHaveBeenCalled();

    claimDevice('user-2');
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it('keeps what a device without an owner has, as it can only be its user’s', () => {
    claimDevice('user-1');
    expect(endSession).not.toHaveBeenCalled();
    expect(loadReminderMinutes()).toBe(1080);
  });
});
