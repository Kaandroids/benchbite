// Workout reminders: local notifications scheduled on the device, one for each day with workouts
// in the coming weeks, following the week as it is, moves included (ADR 0029). Nothing is sent
// from a server, so they work offline and need no push setup.
//
// Imported from the package's modules rather than its index, which also loads the push topic
// module. Expo Go on Android does not include that native module, so loading the index throws
// and the app crashes there, although local notifications work. The paths can go back to
// 'expo-notifications' once Expo Go includes the module, or when the app moves to development
// builds.
import { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
import { getAllScheduledNotificationsAsync } from 'expo-notifications/build/getAllScheduledNotificationsAsync';
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import {
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications/build/NotificationPermissions';
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
import { Platform } from 'react-native';

import { fromIsoDate } from '@/i18n/dates';

const CHANNEL_ID = 'workout-reminders';
/** Marks the notifications scheduled here, so that others are never cancelled with them. */
const ID_PREFIX = 'workout-reminder-';

/** How many days ahead reminders are scheduled; opening the app schedules them again. */
export const REMINDER_DAYS = 28;

export type Reminder = {
  /** The day, YYYY-MM-DD on the device. */
  date: string;
  title: string;
  body: string;
};

/**
 * Shows reminders that arrive while the app is open, which the system would otherwise hide. The
 * notifications named in `hidden` stay hidden while the app is open, for those the app signals
 * itself, such as the end of a rest.
 */
export function showRemindersInForeground(hidden: readonly string[] = []) {
  setNotificationHandler({
    handleNotification: (notification) => {
      const shown = !hidden.includes(notification.request.identifier);
      return Promise.resolve({
        shouldShowBanner: shown,
        shouldShowList: shown,
        shouldPlaySound: shown,
        shouldSetBadge: false,
      });
    },
  });
}

/**
 * Asks for permission to show notifications, with the system prompt if it may still be shown.
 * Resolves to whether reminders can be shown.
 */
export async function requestReminderPermission(channelName: string): Promise<boolean> {
  // Android 13 and later only show the prompt once the app has a notification channel.
  if (Platform.OS === 'android') {
    await setNotificationChannelAsync(CHANNEL_ID, {
      name: channelName,
      importance: AndroidImportance.DEFAULT,
    });
  }
  const current = await getPermissionsAsync();
  if (current.granted) {
    return true;
  }
  if (!current.canAskAgain) {
    return false;
  }
  const requested = await requestPermissionsAsync();
  return requested.granted;
}

/** Removes the workout reminders scheduled on this device. */
export async function cancelReminders() {
  const scheduled = await getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((notification) => notification.identifier.startsWith(ID_PREFIX))
      .map((notification) => cancelScheduledNotificationAsync(notification.identifier)),
  );
}

/**
 * Replaces the workout reminders with one for each given day, at the given time in minutes after
 * midnight; a day whose time has passed gets none. Delivery may be a few minutes late on Android,
 * which does not matter for a reminder and avoids the exact alarm permission.
 */
export async function scheduleReminders(reminders: Reminder[], minutes: number, now = Date.now()) {
  await cancelReminders();
  await Promise.all(
    reminders
      .map((reminder) => ({
        reminder,
        at: fromIsoDate(reminder.date).getTime() + minutes * 60_000,
      }))
      .filter(({ at }) => at > now)
      .map(({ reminder, at }) =>
        scheduleNotificationAsync({
          identifier: `${ID_PREFIX}${reminder.date}`,
          content: { title: reminder.title, body: reminder.body },
          trigger: { type: SchedulableTriggerInputTypes.DATE, channelId: CHANNEL_ID, date: at },
        }),
      ),
  );
}
