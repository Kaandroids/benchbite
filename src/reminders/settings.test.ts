import { Storage } from 'expo-sqlite/kv-store';

import { loadReminderMinutes, saveReminderMinutes } from './settings';

jest.mock('expo-sqlite/kv-store', () => {
  const items = new Map<string, string>();
  return {
    Storage: {
      getItemSync: jest.fn((key: string) => items.get(key) ?? null),
      setItemSync: jest.fn((key: string, value: string) => {
        items.set(key, value);
      }),
      removeItemSync: jest.fn((key: string) => items.delete(key)),
    },
  };
});

describe('reminder settings', () => {
  it('keeps the reminder time until reminders are turned off', () => {
    expect(loadReminderMinutes()).toBeNull();
    saveReminderMinutes(18 * 60 + 15);
    expect(loadReminderMinutes()).toBe(18 * 60 + 15);
    saveReminderMinutes(0);
    expect(loadReminderMinutes()).toBe(0);
    saveReminderMinutes(null);
    expect(loadReminderMinutes()).toBeNull();
  });

  it('reads a stored time that makes no sense, or a storage error, as off', () => {
    Storage.setItemSync('reminders.minutes', '1440');
    expect(loadReminderMinutes()).toBeNull();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.mocked(Storage.getItemSync).mockImplementationOnce(() => {
      throw new Error('broken');
    });
    expect(loadReminderMinutes()).toBeNull();
  });
});
