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
  const reminder = (weekday: number) => ({ weekday, title: 'Workout', body: `Day ${weekday}` });

  it('cancels the previous reminders before scheduling new ones', async () => {
    getAll.mockResolvedValue(scheduled('workout-reminder-2'));
    await scheduleReminders([reminder(1)], 18 * 60);
    expect(cancel).toHaveBeenCalledWith('workout-reminder-2');
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(schedule.mock.invocationCallOrder[0]!);
  });

  it('schedules a weekly reminder per day at the given time', async () => {
    await scheduleReminders([reminder(1), reminder(4)], 18 * 60 + 30);
    expect(schedule).toHaveBeenCalledTimes(2);
    expect(schedule).toHaveBeenCalledWith({
      identifier: 'workout-reminder-1',
      content: { title: 'Workout', body: 'Day 1' },
      trigger: {
        type: 'weekly',
        channelId: 'workout-reminders',
        weekday: 2,
        hour: 18,
        minute: 30,
      },
    });
    expect(schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'workout-reminder-4',
        trigger: expect.objectContaining({ weekday: 5 }),
      }),
    );
  });

  it('counts the trigger weekdays from Sunday', async () => {
    await scheduleReminders([1, 2, 3, 4, 5, 6, 7].map(reminder), 0);
    const weekdays = schedule.mock.calls.map(
      ([request]) => (request.trigger as { weekday: number }).weekday,
    );
    // Monday to Sunday in ISO order.
    expect(weekdays).toEqual([2, 3, 4, 5, 6, 7, 1]);
  });

  it.each([
    [0, 0, 0],
    [7 * 60 + 5, 7, 5],
    [23 * 60 + 59, 23, 59],
  ])('splits %i minutes after midnight into %i:%i', async (minutes, hour, minute) => {
    await scheduleReminders([reminder(1)], minutes);
    expect(schedule).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: expect.objectContaining({ hour, minute }) }),
    );
  });

  it('only cancels when there are no days', async () => {
    getAll.mockResolvedValue(scheduled('workout-reminder-3'));
    await scheduleReminders([], 18 * 60);
    expect(cancel).toHaveBeenCalledWith('workout-reminder-3');
    expect(schedule).not.toHaveBeenCalled();
  });
});
