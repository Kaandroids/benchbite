import { useTranslation } from 'react-i18next';

import { useWorkoutName } from '@/workouts/format';
import type { WeekSession } from '@/workouts/workouts';

import type { Reminder } from './reminders';

/**
 * Writes a day's reminder, in the app language: the names of its workouts, and the size of the
 * workout or, with several, how many there are and how long they take in all.
 */
export function useReminderText() {
  const { t } = useTranslation();
  const workoutName = useWorkoutName();
  return ({ date, sessions }: { date: string; sessions: WeekSession[] }): Reminder => {
    const [only] = sessions;
    return {
      date,
      title: t('reminders.notification.title', { session: sessions.map(workoutName).join(', ') }),
      body:
        sessions.length === 1 && only
          ? t('reminders.notification.body', {
              count: only.exercises.length,
              minutes: only.estimatedMinutes,
            })
          : t('reminders.notification.bodyMany', {
              count: sessions.length,
              minutes: sessions.reduce((total, session) => total + session.estimatedMinutes, 0),
            }),
    };
  };
}
