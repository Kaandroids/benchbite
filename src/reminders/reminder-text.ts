import { useTranslation } from 'react-i18next';

import { useWorkoutName } from '@/workouts/format';
import type { WeekSession } from '@/workouts/workouts';

import type { Reminder } from './reminders';

/**
 * Writes a day's reminder, in the app language: the names of its workouts, and the size of the
 * workout or, with several, how many there are and how long they take in all. Workouts without
 * exercises yet (ADR 0064) take no time, and when none has any, it says so.
 */
export function useReminderText() {
  const { t } = useTranslation();
  const workoutName = useWorkoutName();
  return ({ date, sessions }: { date: string; sessions: WeekSession[] }): Reminder => {
    const [only] = sessions;
    const filled = sessions.filter((session) => session.exercises.length > 0);
    return {
      date,
      title: t('reminders.notification.title', { session: sessions.map(workoutName).join(', ') }),
      body:
        sessions.length > 0 && filled.length === 0
          ? t('reminders.notification.bodyEmpty')
          : sessions.length === 1 && only
            ? t('reminders.notification.body', {
                count: only.exercises.length,
                minutes: only.estimatedMinutes,
              })
            : t('reminders.notification.bodyMany', {
                count: sessions.length,
                minutes: filled.reduce((total, session) => total + session.estimatedMinutes, 0),
              }),
    };
  };
}
