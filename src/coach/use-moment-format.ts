import { useTranslation } from 'react-i18next';

import {
  daysBetween,
  isoWeekday,
  useClockFormat,
  useShortDateFormat,
  useWeekdayFormat,
} from '@/i18n/dates';

/**
 * Formats when something was written in a chat, from `today`: "Today 08:30", "Yesterday 18:12",
 * the weekday within a week, else the date, each with the time.
 */
export function useMomentFormat(today: Date) {
  const { t } = useTranslation();
  const clock = useClockFormat();
  const weekday = useWeekdayFormat();
  const date = useShortDateFormat(today);
  return (moment: Date) => {
    const time = clock(moment);
    const days = daysBetween(moment, today);
    if (days <= 0) return t('bite.moment.today', { time });
    if (days === 1) return t('bite.moment.yesterday', { time });
    const day = days < 7 ? weekday(isoWeekday(moment)) : date(moment);
    return t('bite.moment.day', { day, time });
  };
}

/** Whether two moments fall on the same day of the device. */
export function sameDay(a: Date, b: Date): boolean {
  return daysBetween(a, b) === 0;
}
