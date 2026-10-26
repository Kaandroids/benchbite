import type { WorkoutPlan } from '@/onboarding/plan';
import { cancelReminders, requestReminderPermission } from '@/reminders/reminders';
import { saveReminderMinutes } from '@/reminders/settings';
import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen, waitFor } from '@/test/render';

import { RemindersStep } from './reminders';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));
jest.mock('@/reminders/reminders', () => ({
  cancelReminders: jest.fn(),
  requestReminderPermission: jest.fn(),
}));
jest.mock('@/reminders/settings', () => ({ saveReminderMinutes: jest.fn() }));

const PLAN: WorkoutPlan = {
  sessions: [
    {
      weekdays: [1, 5],
      type: 'push',
      exercises: [],
      estimatedMinutes: 45,
      time: { warmUp: 300, main: 2100, extras: 300, conditioning: 0 },
      work: { exercises: 0, sets: 0, rest: 0 },
    },
    {
      weekdays: [3],
      type: 'pull',
      exercises: ['row'].map((exerciseId) => ({
        exerciseId,
        slot: 'horizontal_pull',
        sets: 3,
        target: { seconds: 30 },
        restSeconds: 60,
      })),
      estimatedMinutes: 30,
      time: { warmUp: 300, main: 1200, extras: 300, conditioning: 0 },
      work: { exercises: 0, sets: 0, rest: 0 },
    },
  ],
};

const turnOn = () => fireEvent.press(screen.getByRole('button', { name: 'Turn on reminders' }));

describe('RemindersStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(cancelReminders).mockResolvedValue();
    mockStep = createStep({ plan: PLAN });
  });

  it('shows the training days and starts at 6 PM', async () => {
    await render(<RemindersStep />);
    expect(screen.getByText('Mon')).toBeTruthy();
    expect(screen.getByText('Wed')).toBeTruthy();
    expect(screen.getByText(/^6:00\sPM$/)).toBeTruthy();
  });

  it('asks for permission and keeps the chosen time, for the app to schedule the reminders', async () => {
    jest.mocked(requestReminderPermission).mockResolvedValue(true);
    await render(<RemindersStep />);
    await fireEvent(
      screen.getByRole('adjustable', { name: 'Reminder time' }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } },
    );
    await turnOn();

    expect(requestReminderPermission).toHaveBeenCalledWith('Workout reminders');
    expect(saveReminderMinutes).toHaveBeenCalledWith(18 * 60 + 15);
    expect(mockStep.next).toHaveBeenCalledWith({ reminderMinutes: 18 * 60 + 15 });
  });

  it('starts from a time chosen before', async () => {
    jest.mocked(requestReminderPermission).mockResolvedValue(true);
    mockStep = createStep({ plan: PLAN, reminderMinutes: 7 * 60 });
    await render(<RemindersStep />);
    await turnOn();
    expect(saveReminderMinutes).toHaveBeenCalledWith(7 * 60);
  });

  it('moves on without reminders when permission is denied', async () => {
    jest.mocked(requestReminderPermission).mockResolvedValue(false);
    await render(<RemindersStep />);
    await turnOn();
    // A time kept from before is removed with its reminders.
    expect(saveReminderMinutes).toHaveBeenCalledWith(null);
    expect(saveReminderMinutes).not.toHaveBeenCalledWith(expect.any(Number));
    expect(cancelReminders).toHaveBeenCalledTimes(1);
    expect(mockStep.next).toHaveBeenCalledWith({ reminderMinutes: undefined });
  });

  it('moves on without reminders when asking for permission fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(requestReminderPermission).mockRejectedValue(new Error('no'));
    await render(<RemindersStep />);
    await turnOn();
    expect(saveReminderMinutes).toHaveBeenCalledWith(null);
    expect(mockStep.next).toHaveBeenCalledWith({ reminderMinutes: undefined });
    warn.mockRestore();
  });

  it('cancels earlier reminders and moves on with Not now', async () => {
    await render(<RemindersStep />);
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    expect(saveReminderMinutes).toHaveBeenCalledWith(null);
    expect(cancelReminders).toHaveBeenCalledTimes(1);
    expect(requestReminderPermission).not.toHaveBeenCalled();
    expect(mockStep.next).toHaveBeenCalledWith({ reminderMinutes: undefined });
  });

  it('moves on with Not now even if cancelling fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(cancelReminders).mockRejectedValue(new Error('no'));
    await render(<RemindersStep />);
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    expect(mockStep.next).toHaveBeenCalledWith({ reminderMinutes: undefined });
    await waitFor(() => expect(warn).toHaveBeenCalled());
    warn.mockRestore();
  });

  it('cannot skip while reminders are being turned on', async () => {
    jest.mocked(requestReminderPermission).mockReturnValue(new Promise(() => {}));
    await render(<RemindersStep />);
    void turnOn();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Turn on reminders' })).toBeBusy(),
    );
    expect(screen.getByRole('button', { name: 'Not now' })).toBeDisabled();
  });
});
