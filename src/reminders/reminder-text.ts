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
  const bodyOf = (sessions: WeekSession[]) => {
    const filled = sessions.filter((session) => session.exercises.length > 0);
    if (sessions.length > 0 && filled.length === 0) {
      return t('reminders.notification.bodyEmpty');
    }
    const [only] = sessions;
    if (sessions.length === 1 && only) {
      return t('reminders.notification.body', {
        count: only.exercises.length,
        minutes: only.estimatedMinutes,
      });
    }
    // Every workout planned counts, but the time only of those with exercises: an empty one cannot
    // be started yet, so the warm-up its time holds would add minutes no one trains.
    return t('reminders.notification.bodyMany', {
      count: sessions.length,
      minutes: filled.reduce((total, session) => total + session.estimatedMinutes, 0),
    });
  };
  return ({ date, sessions }: { date: string; sessions: WeekSession[] }): Reminder => ({
    date,
    title: t('reminders.notification.title', { session: sessions.map(workoutName).join(', ') }),
    body: bodyOf(sessions),
  });
}
