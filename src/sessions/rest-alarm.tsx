// The end of the rest between sets, signalled even when the app is in the background or the
// phone is locked (#35): a local notification is scheduled for the moment the rest ends, and
// replaced or cancelled whenever the rest changes. While the app is open, a haptic signals it
// instead, and the notification is not shown.
//
// Imported from the package's modules rather than its index, as in src/reminders/reminders.ts.
import * as Haptics from 'expo-haptics';
import { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import {
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications/build/NotificationPermissions';
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { useExerciseLibrary } from '@/exercises/library';

import { updateSession, useActiveSession } from './session';
import { useUserId } from './start';

/** The one notification for the end of the rest; a new rest replaces it. */
export const REST_NOTIFICATION_ID = 'rest-end';
const CHANNEL_ID = 'rest-timer';
/** A rest that ended longer ago than this, as seen on coming back to the app, is not signalled. */
const LATE_MS = 2000;

type RestNotification = { title: string; body: string; channelName: string };

/**
 * Schedules the notification for the end of a rest, replacing the one before. Without permission
 * it asks once, with the system prompt, and otherwise schedules nothing.
 */
export async function scheduleRestEnd(endsAt: number, content: RestNotification) {
  if (Platform.OS === 'android') {
    // High importance, so that it shows over the screen and vibrates.
    await setNotificationChannelAsync(CHANNEL_ID, {
      name: content.channelName,
      importance: AndroidImportance.HIGH,
    });
  }
  const permission = await getPermissionsAsync();
  if (!permission.granted) {
    if (!permission.canAskAgain || !(await requestPermissionsAsync()).granted) {
      return;
    }
  }
  await scheduleNotificationAsync({
    identifier: REST_NOTIFICATION_ID,
    content: { title: content.title, body: content.body },
    trigger: { type: SchedulableTriggerInputTypes.DATE, date: endsAt, channelId: CHANNEL_ID },
  });
}

/** Cancels the notification for the end of the rest, if one is scheduled. */
export async function cancelRestEnd() {
  await cancelScheduledNotificationAsync(REST_NOTIFICATION_ID);
}

/**
 * Keeps the end of the workout's rest signalled, whatever screen is open: schedules its
 * notification, and when the rest ends with the app open, vibrates and ends it.
 */
export function RestAlarm() {
  const { t } = useTranslation();
  const session = useActiveSession(useUserId());
  const library = useExerciseLibrary();
  const endsAt = session?.rest?.endsAt;
  const exerciseId = session?.exercises[session.current]?.exerciseId;
  const name = library.data?.find((item) => item.id === exerciseId)?.name;

  useEffect(() => {
    if (endsAt === undefined || endsAt <= Date.now()) {
      void cancelRestEnd().catch((error: unknown) =>
        console.warn('Could not cancel the rest notification', error),
      );
      return;
    }
    void scheduleRestEnd(endsAt, {
      title: t('session.restOver.title'),
      body: name ? t('session.restOver.next', { name }) : t('session.restOver.body'),
      channelName: t('session.restOver.channel'),
    }).catch((error: unknown) => console.warn('Could not schedule the rest notification', error));
    const timer = setTimeout(() => {
      if (Date.now() - endsAt < LATE_MS) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      updateSession((current) =>
        current.rest?.endsAt === endsAt ? { ...current, rest: null } : current,
      );
    }, endsAt - Date.now());
    return () => clearTimeout(timer);
  }, [endsAt, name, t]);

  return null;
}
