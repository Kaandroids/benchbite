import * as Haptics from 'expo-haptics';
import { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
import {
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications/build/NotificationPermissions';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';

import { useExerciseLibrary } from '@/exercises/library';
import { act, render } from '@/test/render';
import { testExercise, testWorkout } from '@/workouts/test-data';

import { RestAlarm, scheduleRestEnd } from './rest-alarm';
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
jest.mock('./start', () => ({ useUserId: () => 'user-a' }));

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

  it('asks for permission once, and schedules nothing without it', async () => {
    getPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    requestPermissions.mockResolvedValue({ granted: false });
    await scheduleRestEnd(NOW + 90_000, content);
    expect(requestPermissions).toHaveBeenCalledTimes(1);
    getPermissions.mockResolvedValue({ granted: false, canAskAgain: false });
    await scheduleRestEnd(NOW + 90_000, content);
    expect(requestPermissions).toHaveBeenCalledTimes(1);
    expect(schedule).not.toHaveBeenCalled();
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
