import * as Haptics from 'expo-haptics';
import { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
import {
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications/build/NotificationPermissions';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import { Storage } from 'expo-sqlite/kv-store';
import { Alert, Linking, type AlertButton } from 'react-native';

import { useExerciseLibrary } from '@/exercises/library';
import { act, render } from '@/test/render';
import { testExercise, testWorkout } from '@/workouts/test-data';

import {
  enableRestAlerts,
  offerRestAlarm,
  refreshPermission,
  resetPermission,
  RestAlarm,
  scheduleRestEnd,
} from './rest-alarm';
import { changeRest, resetSessionStore, startSession, toggleDone, updateSession } from './session';

jest.mock('expo-sqlite/kv-store', () => {
  const items = new Map<string, string>();
  return {
    Storage: {
      getItemSync: (key: string) => items.get(key) ?? null,
      setItemSync: (key: string, value: string) => void items.set(key, value),
      removeItemSync: (key: string) => void items.delete(key),
    },
  };
});
jest.mock('expo-notifications/build/cancelScheduledNotificationAsync', () => ({
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-notifications/build/NotificationPermissions', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));
jest.mock('expo-notifications/build/scheduleNotificationAsync', () => ({
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('rest-end')),
}));
jest.mock('expo-notifications/build/setNotificationChannelAsync', () => ({
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/exercises/library', () => ({ useExerciseLibrary: jest.fn() }));
jest.mock('@/providers/session-provider', () => ({ useUserId: () => 'user-a' }));

const schedule = jest.mocked(scheduleNotificationAsync);
const cancel = jest.mocked(cancelScheduledNotificationAsync);
const getPermissions = getPermissionsAsync as jest.Mock;
const requestPermissions = requestPermissionsAsync as jest.Mock;

const NOW = new Date(2026, 9, 24, 18, 0).getTime();
const PUSH = testWorkout(4, {
  exercises: [testExercise('bench', { sets: 3, restSeconds: 90 })],
});
const content = { title: 'Rest is over', body: 'Next up: Bench press', channelName: 'Rest timer' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
  getPermissions.mockResolvedValue({ granted: true, canAskAgain: true });
  jest.mocked(useExerciseLibrary).mockReturnValue({
    data: [{ id: 'bench', name: 'Bench press' }],
  } as never);
  resetSessionStore();
  startSession('user-a', PUSH, {}, {}, NOW);
  Storage.removeItemSync('rest-alarm.asked');
  resetPermission();
});
afterEach(() => jest.useRealTimers());

describe('scheduleRestEnd', () => {
  it('schedules one notification for the end of the rest', async () => {
    await scheduleRestEnd(NOW + 90_000, content);
    expect(schedule).toHaveBeenCalledWith({
      identifier: 'rest-end',
      content: { title: 'Rest is over', body: 'Next up: Bench press' },
      trigger: { type: 'date', date: NOW + 90_000, channelId: 'rest-timer' },
    });
  });

  it('schedules nothing without permission, and does not ask for it', async () => {
    getPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    await scheduleRestEnd(NOW + 90_000, content);
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });
});

describe('offerRestAlarm', () => {
  const offer = {
    title: 'Tell you when your rest is over?',
    message: 'We let you know when it ends.',
    allow: 'Allow',
    notNow: 'Not now',
    channelName: 'Rest timer',
  };
  const answer = (button: string) =>
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons?: AlertButton[]) => {
      buttons?.find((item) => item.text === button)?.onPress?.();
    });

  it('asks first, and shows the system prompt only on Allow', async () => {
    getPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    requestPermissions.mockResolvedValue({ granted: true });
    const alert = answer('Allow');
    await offerRestAlarm(offer);
    expect(alert).toHaveBeenCalledWith(
      offer.title,
      offer.message,
      expect.any(Array),
      expect.objectContaining({ cancelable: true }),
    );
    expect(requestPermissions).toHaveBeenCalledTimes(1);
  });

  it('keeps the system prompt on Not now, and asks only once', async () => {
    getPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    const alert = answer('Not now');
    await offerRestAlarm(offer);
    await offerRestAlarm(offer);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it('does not ask when notifications are allowed, or cannot be asked for', async () => {
    const alert = answer('Allow');
    getPermissions.mockResolvedValue({ granted: true, canAskAgain: true });
    await offerRestAlarm(offer);
    getPermissions.mockResolvedValue({ granted: false, canAskAgain: false });
    await offerRestAlarm(offer);
    expect(alert).not.toHaveBeenCalled();
  });
});

describe('RestAlarm', () => {
  it('schedules the end of a rest, and replaces it when the rest changes', async () => {
    await render(<RestAlarm />);
    await act(async () => updateSession((session) => toggleDone(session, 0, 0, NOW)));
    expect(schedule).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: { title: 'Rest is over', body: 'Next up: Bench press' },
        trigger: expect.objectContaining({ date: NOW + 90_000 }),
      }),
    );
    await act(async () => updateSession((session) => changeRest(session, 15, NOW)));
    expect(schedule).toHaveBeenLastCalledWith(
      expect.objectContaining({ trigger: expect.objectContaining({ date: NOW + 105_000 }) }),
    );
  });

  it('cancels it when the rest is skipped', async () => {
    await render(<RestAlarm />);
    await act(async () => updateSession((session) => toggleDone(session, 0, 0, NOW)));
    cancel.mockClear();
    await act(async () => updateSession((session) => ({ ...session, rest: null })));
    expect(cancel).toHaveBeenCalledWith('rest-end');
  });

  it('cancels it also when the rest is skipped while it is being scheduled', async () => {
    // The permission comes only after the skip, so scheduling finishes after the cancel is made.
    let allow = (_permission: object) => {};
    await render(<RestAlarm />);
    getPermissions.mockImplementationOnce(() => new Promise((resolve) => (allow = resolve)));
    await act(async () => updateSession((session) => toggleDone(session, 0, 0, NOW)));
    await act(async () => updateSession((session) => ({ ...session, rest: null })));
    await act(async () => allow({ granted: true, canAskAgain: true }));
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(cancel.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      schedule.mock.invocationCallOrder[0]!,
    );
  });

  it('vibrates and ends the rest when it is over while the app is open', async () => {
    await render(<RestAlarm />);
    await act(async () => updateSession((session) => toggleDone(session, 0, 0, NOW)));
    await act(async () => {
      jest.advanceTimersByTime(90_000);
    });
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
    expect(cancel).toHaveBeenCalledWith('rest-end');
  });
});

describe('enableRestAlerts', () => {
  const texts = {
    channelName: 'Rest timer',
    offTitle: 'Notifications are off',
    offMessage: "Turn them on in your phone's settings.",
    openSettings: 'Open settings',
    notNow: 'Not now',
  };

  it('shows the system prompt while it can', async () => {
    getPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    requestPermissions.mockResolvedValue({ granted: true });
    await enableRestAlerts(texts);
    expect(requestPermissions).toHaveBeenCalledTimes(1);
  });

  it("explains and opens the phone's settings when the app can no longer ask", async () => {
    getPermissions.mockResolvedValue({ granted: false, canAskAgain: false });
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons?: AlertButton[]) => {
      buttons?.find((item) => item.text === 'Open settings')?.onPress?.();
    });
    await enableRestAlerts(texts);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Notifications are off',
      "Turn them on in your phone's settings.",
      expect.any(Array),
    );
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(openSettings).toHaveBeenCalled();
  });
});

describe('the rest alarm and the permission', () => {
  it('schedules the running rest once notifications are allowed', async () => {
    getPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    await render(<RestAlarm />);
    await act(async () => updateSession((session) => toggleDone(session, 0, 0, NOW)));
    expect(schedule).not.toHaveBeenCalled();
    getPermissions.mockResolvedValue({ granted: true, canAskAgain: true });
    await act(() => refreshPermission());
    expect(schedule).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: expect.objectContaining({ date: NOW + 90_000 }) }),
    );
  });
});
