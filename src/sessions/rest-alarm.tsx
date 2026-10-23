// The end of the rest between sets, signalled even when the app is in the background or the
// phone is locked (#35): a local notification is scheduled for the moment the rest ends, and
// replaced or cancelled whenever the rest changes. While the app is open, a haptic signals it
// instead, and the notification is not shown. Permission is offered once, when a workout starts.
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
import { Storage } from 'expo-sqlite/kv-store';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform } from 'react-native';

import { useExerciseLibrary } from '@/exercises/library';

import { updateSession, useActiveSession } from './session';
import { useUserId } from './start';

/** The one notification for the end of the rest; a new rest replaces it. */
export const REST_NOTIFICATION_ID = 'rest-end';
const CHANNEL_ID = 'rest-timer';
/** A rest that ended longer ago than this, as seen on coming back to the app, is not signalled. */
const LATE_MS = 2000;
/** Set once the user was asked, so that a "Not now" is not asked again. */
const ASKED_KEY = 'rest-alarm.asked';

type RestNotification = { title: string; body: string; channelName: string };

type RestAlarmOffer = {
  title: string;
  message: string;
  allow: string;
  notNow: string;
  channelName: string;
};

async function createChannel(name: string) {
  if (Platform.OS === 'android') {
    // High importance, so that it shows over the screen and vibrates. Android 13 and later also
    // only show the permission prompt once the app has a channel.
    await setNotificationChannelAsync(CHANNEL_ID, { name, importance: AndroidImportance.HIGH });
  }
}

/**
 * Offers to signal the end of rests, when a workout starts and notifications are not allowed
 * yet. The app's own question comes first, so that "Not now" keeps the system prompt, which can
 * be shown only once, for later; either way it is asked only once.
 */
export async function offerRestAlarm(offer: RestAlarmOffer) {
  const permission = await getPermissionsAsync();
  if (permission.granted || !permission.canAskAgain || Storage.getItemSync(ASKED_KEY)) {
    return;
  }
  Storage.setItemSync(ASKED_KEY, 'true');
  const allowed = await new Promise<boolean>((resolve) =>
    Alert.alert(
      offer.title,
      offer.message,
      [
        { text: offer.notNow, style: 'cancel', onPress: () => resolve(false) },
        { text: offer.allow, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
  if (allowed) {
    await createChannel(offer.channelName);
    await requestPermissionsAsync();
  }
}

/** Schedules the notification for the end of a rest, replacing the one before, when allowed. */
export async function scheduleRestEnd(endsAt: number, content: RestNotification) {
  if (!(await getPermissionsAsync()).granted) {
    return;
  }
  await createChannel(content.channelName);
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
