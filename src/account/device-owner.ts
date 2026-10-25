import { useEffect } from 'react';

import { readItem, writeItem } from '@/lib/device-storage';
import { useUserId } from '@/providers/session-provider';
import { cancelReminders } from '@/reminders/reminders';
import { saveReminderMinutes } from '@/reminders/settings';
import { endSession } from '@/sessions/session';

/** The user whose workout in progress and reminders the device keeps. */
const OWNER_KEY = 'device.owner';

/**
 * Makes the signed-in user the owner of what the device keeps for its user. When another user
 * signs in, or a new guest replaces one, the previous user's workout in progress and reminders go
 * (ADR 0031). The same user signing in again keeps them, and so does a guest who creates an account,
 * as their id stays the same.
 */
export function claimDevice(userId: string) {
  const owner = readItem(OWNER_KEY);
  if (owner === userId) {
    return;
  }
  writeItem(OWNER_KEY, userId);
  // A device without an owner kept nothing for anyone else: it is new, or from before owners.
  if (owner === null) {
    return;
  }
  endSession();
  saveReminderMinutes(null);
  void cancelReminders().catch((error: unknown) =>
    console.warn('Could not cancel the reminders', error),
  );
}

/** Claims the device for each user that signs in. */
export function useClaimDevice() {
  const userId = useUserId();
  useEffect(() => {
    if (userId) {
      claimDevice(userId);
    }
  }, [userId]);
}
