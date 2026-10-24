import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { fromIsoDate, toIsoDate } from '@/i18n/dates';
import { useWeekSchedule } from '@/workouts/use-week-schedule';
import { upcomingWorkouts } from '@/workouts/week-schedule';

import { useReminderText } from './reminder-text';
import { REMINDER_DAYS, scheduleReminders, type Reminder } from './reminders';
import { loadReminderMinutes } from './settings';

/**
 * Keeps the workout reminders of the coming weeks in line with the week as it is (ADR 0029):
 * schedules them again whenever the workouts, this week's moves or the finished workouts change,
 * and each time the app comes back on a new day. Does nothing while reminders are off.
 */
export function ReminderSync() {
  const reminderFor = useReminderText();
  const [today, setToday] = useState(() => toIsoDate(new Date()));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setToday(toIsoDate(new Date()));
      }
    });
    return () => subscription.remove();
  }, []);

  const { schedule, plan, moves, finished } = useWeekSchedule(fromIsoDate(today));
  const loaded = plan.data !== undefined && moves.data !== undefined && finished.data !== undefined;
  const reminders: Reminder[] | null = loaded
    ? upcomingWorkouts(schedule, plan.data?.sessions ?? [], fromIsoDate(today), REMINDER_DAYS).map(
        reminderFor,
      )
    : null;

  // Scheduled again only when what the reminders say changes, not on every render.
  const key = reminders ? JSON.stringify(reminders) : null;
  useEffect(() => {
    const minutes = loadReminderMinutes();
    if (key === null || minutes === null) {
      return;
    }
    scheduleReminders(JSON.parse(key) as Reminder[], minutes).catch((error: unknown) =>
      console.warn('Could not schedule the reminders', error),
    );
  }, [key]);

  return null;
}
