import type { WorkoutPlan } from '@/onboarding/plan';
import {
  cancelReminders,
  requestReminderPermission,
  scheduleReminders,
} from '@/reminders/reminders';
import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen, waitFor } from '@/test/render';

import { RemindersStep } from './reminders';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));
jest.mock('@/reminders/reminders', () => ({
  cancelReminders: jest.fn(),
  requestReminderPermission: jest.fn(),
  scheduleReminders: jest.fn(),
}));

const PLAN: WorkoutPlan = {
  sessions: [
    { weekday: 1, type: 'push', exercises: [], finisher: null, estimatedMinutes: 45 },
    {
      weekday: 3,
      type: 'pull',
      exercises: ['row'].map((exerciseId) => ({
        exerciseId,
        slot: 'horizontal_pull',
        sets: 3,
        target: { seconds: 30 },
        restSeconds: 60,
      })),
      finisher: null,
      estimatedMinutes: 30,
    },
  ],
};

const turnOn = () => fireEvent.press(screen.getByRole('button', { name: 'Turn on reminders' }));

describe('RemindersStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(cancelReminders).mockResolvedValue();
    jest.mocked(scheduleReminders).mockResolvedValue();
    mockStep = createStep({ plan: PLAN });
  });

  it('shows the training days and starts at 6 PM', async () => {
    await render(<RemindersStep />);
    expect(screen.getByText('Mon')).toBeTruthy();
    expect(screen.getByText('Wed')).toBeTruthy();
    expect(screen.getByText(/^6:00\sPM$/)).toBeTruthy();
  });

  it('asks for permission and schedules one reminder per session at the chosen time', async () => {
    jest.mocked(requestReminderPermission).mockResolvedValue(true);
    await render(<RemindersStep />);
    await fireEvent(
      screen.getByRole('adjustable', { name: 'Reminder time' }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } },
    );
    await turnOn();

    expect(requestReminderPermission).toHaveBeenCalledWith('Workout reminders');
    expect(scheduleReminders).toHaveBeenCalledWith(
      [
        {
          weekday: 1,
          title: 'Today: Push',
          body: "0 exercises, about 45 min. You've got this!",
        },
        {
          weekday: 3,
          title: 'Today: Pull',
          body: "1 exercise, about 30 min. You've got this!",
        },
      ],
      18 * 60 + 15,
    );
    expect(mockStep.next).toHaveBeenCalledWith({ reminderMinutes: 18 * 60 + 15 });
  });

  it('starts from a time chosen before', async () => {
    jest.mocked(requestReminderPermission).mockResolvedValue(true);
    mockStep = createStep({ plan: PLAN, reminderMinutes: 7 * 60 });
    await render(<RemindersStep />);
    await turnOn();
    expect(scheduleReminders).toHaveBeenCalledWith(expect.any(Array), 7 * 60);
  });

  it('moves on without reminders when permission is denied', async () => {
    jest.mocked(requestReminderPermission).mockResolvedValue(false);
    await render(<RemindersStep />);
    await turnOn();
    expect(scheduleReminders).not.toHaveBeenCalled();
    expect(mockStep.next).toHaveBeenCalledWith({ reminderMinutes: undefined });
  });

  it('moves on without reminders when scheduling fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(requestReminderPermission).mockResolvedValue(true);
    jest.mocked(scheduleReminders).mockRejectedValue(new Error('no'));
    await render(<RemindersStep />);
    await turnOn();
    expect(mockStep.next).toHaveBeenCalledWith({ reminderMinutes: undefined });
    warn.mockRestore();
  });

  it('cancels earlier reminders and moves on with Not now', async () => {
    await render(<RemindersStep />);
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
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
