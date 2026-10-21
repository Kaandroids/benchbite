// Workout reminders: local notifications scheduled on the device, one per training day, repeating
// every week. Nothing is sent from a server, so they work offline and need no push setup. The
// scheduled notifications are the only record of the reminders; the device asks the system for
// them instead of keeping a copy that could drift.
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

const CHANNEL_ID = 'workout-reminders';
/** Marks the notifications scheduled here, so that others are never cancelled with them. */
const ID_PREFIX = 'workout-reminder-';

export type Reminder = {
  /** ISO weekday, 1 for Monday to 7 for Sunday. */
  weekday: number;
  title: string;
  body: string;
};

/** Shows reminders that arrive while the app is open, which the system would otherwise hide. */
export function showRemindersInForeground() {
  setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
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
 * Replaces the workout reminders with one per given day, at the given time in minutes after
 * midnight. Delivery may be a few minutes late on Android, which does not matter for a reminder
 * and avoids the exact alarm permission.
 */
export async function scheduleReminders(reminders: Reminder[], minutes: number) {
  await cancelReminders();
  await Promise.all(
    reminders.map((reminder) =>
      scheduleNotificationAsync({
        identifier: `${ID_PREFIX}${reminder.weekday}`,
        content: { title: reminder.title, body: reminder.body },
        trigger: {
          type: SchedulableTriggerInputTypes.WEEKLY,
          channelId: CHANNEL_ID,
          // The trigger counts from Sunday (1) to Saturday (7).
          weekday: (reminder.weekday % 7) + 1,
          hour: Math.floor(minutes / 60),
          minute: minutes % 60,
        },
      }),
    ),
  );
}
