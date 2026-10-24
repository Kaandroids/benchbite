import { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
import { getAllScheduledNotificationsAsync } from 'expo-notifications/build/getAllScheduledNotificationsAsync';
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import {
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications/build/NotificationPermissions';
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
import { Platform } from 'react-native';

import {
  cancelReminders,
  requestReminderPermission,
  scheduleReminders,
  showRemindersInForeground,
} from './reminders';

jest.mock('expo-notifications/build/cancelScheduledNotificationAsync', () => ({
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-notifications/build/getAllScheduledNotificationsAsync', () => ({
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
}));
jest.mock('expo-notifications/build/NotificationPermissions', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));
jest.mock('expo-notifications/build/NotificationsHandler', () => ({
  setNotificationHandler: jest.fn(),
}));
jest.mock('expo-notifications/build/scheduleNotificationAsync', () => ({
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('id')),
}));
jest.mock('expo-notifications/build/setNotificationChannelAsync', () => ({
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
}));

const getAll = jest.mocked(getAllScheduledNotificationsAsync);
const cancel = jest.mocked(cancelScheduledNotificationAsync);
const schedule = jest.mocked(scheduleNotificationAsync);
const setChannel = jest.mocked(setNotificationChannelAsync);
const getPermissions = getPermissionsAsync as jest.Mock;
const requestPermissions = requestPermissionsAsync as jest.Mock;

const scheduled = (...identifiers: string[]) =>
  identifiers.map((identifier) => ({ identifier })) as unknown as Awaited<
    ReturnType<typeof getAllScheduledNotificationsAsync>
  >;

const notification = (identifier: string) =>
  ({ request: { identifier } }) as Parameters<
    NonNullable<Parameters<typeof setNotificationHandler>[0]>['handleNotification']
  >[0];

const originalOS = Platform.OS;

function setPlatform(os: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}

beforeEach(() => {
  jest.clearAllMocks();
  getAll.mockResolvedValue(scheduled());
});

afterEach(() => {
  setPlatform(originalOS);
});

describe('showRemindersInForeground', () => {
  it('shows reminders as banners and in the list, with sound but no badge', async () => {
    showRemindersInForeground();
    expect(setNotificationHandler).toHaveBeenCalledTimes(1);
    const handler = jest.mocked(setNotificationHandler).mock.calls[0]![0]!;
    await expect(handler.handleNotification(notification('workout-reminder-1'))).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });

  it('keeps the notifications the app signals itself hidden', async () => {
    showRemindersInForeground(['rest-end']);
    const handler = jest.mocked(setNotificationHandler).mock.calls[0]![0]!;
    await expect(handler.handleNotification(notification('rest-end'))).resolves.toEqual({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
  });
});

describe('requestReminderPermission', () => {
  it('creates the notification channel first on Android', async () => {
    setPlatform('android');
    getPermissions.mockResolvedValue({ granted: true, canAskAgain: true });
    await requestReminderPermission('Workout reminders');
    expect(setChannel).toHaveBeenCalledWith('workout-reminders', {
      name: 'Workout reminders',
      importance: AndroidImportance.DEFAULT,
    });
    expect(setChannel.mock.invocationCallOrder[0]).toBeLessThan(
      getPermissions.mock.invocationCallOrder[0]!,
    );
  });

  it('creates no notification channel on iOS', async () => {
    setPlatform('ios');
    getPermissions.mockResolvedValue({ granted: true, canAskAgain: true });
    await requestReminderPermission('Workout reminders');
    expect(setChannel).not.toHaveBeenCalled();
  });

  it('does not ask again when permission is granted', async () => {
    getPermissions.mockResolvedValue({ granted: true, canAskAgain: true });
    await expect(requestReminderPermission('Workout reminders')).resolves.toBe(true);
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it('gives up when the system prompt may not be shown again', async () => {
    getPermissions.mockResolvedValue({ granted: false, canAskAgain: false });
    await expect(requestReminderPermission('Workout reminders')).resolves.toBe(false);
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it.each([true, false])('resolves to the answer to the prompt (%s)', async (granted) => {
    getPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    requestPermissions.mockResolvedValue({ granted, canAskAgain: true });
    await expect(requestReminderPermission('Workout reminders')).resolves.toBe(granted);
    expect(requestPermissions).toHaveBeenCalledTimes(1);
  });
});

describe('cancelReminders', () => {
  it('cancels only the workout reminders', async () => {
    getAll.mockResolvedValue(
      scheduled('workout-reminder-1', 'meal-reminder-1', 'workout-reminder-7', 'workout'),
    );
    await cancelReminders();
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledWith('workout-reminder-1');
    expect(cancel).toHaveBeenCalledWith('workout-reminder-7');
  });

  it('does nothing when no reminders are scheduled', async () => {
    getAll.mockResolvedValue(scheduled());
    await cancelReminders();
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe('scheduleReminders', () => {
  // Wednesday, October 21, at 9:00.
  const NOW = new Date(2026, 9, 21, 9, 0).getTime();
  const reminder = (date: string) => ({ date, title: 'Workout', body: `On ${date}` });

  it('cancels the previous reminders before scheduling new ones', async () => {
    getAll.mockResolvedValue(scheduled('workout-reminder-2026-10-20'));
    await scheduleReminders([reminder('2026-10-22')], 18 * 60, NOW);
    expect(cancel).toHaveBeenCalledWith('workout-reminder-2026-10-20');
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(schedule.mock.invocationCallOrder[0]!);
  });

  it('schedules one reminder per day at the given time', async () => {
    await scheduleReminders([reminder('2026-10-22'), reminder('2026-11-02')], 18 * 60 + 30, NOW);
    expect(schedule).toHaveBeenCalledTimes(2);
    expect(schedule).toHaveBeenCalledWith({
      identifier: 'workout-reminder-2026-10-22',
      content: { title: 'Workout', body: 'On 2026-10-22' },
      trigger: {
        type: 'date',
        channelId: 'workout-reminders',
        date: new Date(2026, 9, 22, 18, 30).getTime(),
      },
    });
    expect(schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'workout-reminder-2026-11-02',
        trigger: expect.objectContaining({ date: new Date(2026, 10, 2, 18, 30).getTime() }),
      }),
    );
  });

  it('schedules today only while its time is still ahead', async () => {
    await scheduleReminders([reminder('2026-10-21')], 8 * 60 + 45, NOW);
    expect(schedule).not.toHaveBeenCalled();
    await scheduleReminders([reminder('2026-10-21')], 9 * 60 + 15, NOW);
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it('keeps the time on the days the clocks change', async () => {
    const zone = process.env.TZ;
    process.env.TZ = 'Europe/Berlin';
    try {
      // The clocks go back on October 25 and forward on March 28.
      await scheduleReminders([reminder('2026-10-25'), reminder('2027-03-28')], 8 * 60, 0);
      const hours = schedule.mock.calls.map(([request]) =>
        new Date((request.trigger as { date: number }).date).getHours(),
      );
      expect(hours).toEqual([8, 8]);
    } finally {
      process.env.TZ = zone;
    }
  });

  it('runs one change to the reminders at a time, in order', async () => {
    let release: () => void = () => undefined;
    getAll.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve(scheduled()))),
    );
    const scheduling = scheduleReminders([reminder('2026-10-22')], 18 * 60, NOW);
    const cancelling = cancelReminders();
    await Promise.resolve();
    // The cancel waits for the reminders being scheduled, so it does not leave them behind.
    expect(getAll).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([scheduling, cancelling]);
    expect(getAll).toHaveBeenCalledTimes(2);
    expect(getAll.mock.invocationCallOrder[1]).toBeGreaterThan(
      schedule.mock.invocationCallOrder[0]!,
    );
  });

  it('only cancels when there are no days', async () => {
    getAll.mockResolvedValue(scheduled('workout-reminder-2026-10-22'));
    await scheduleReminders([], 18 * 60, NOW);
    expect(cancel).toHaveBeenCalledWith('workout-reminder-2026-10-22');
    expect(schedule).not.toHaveBeenCalled();
  });
});
