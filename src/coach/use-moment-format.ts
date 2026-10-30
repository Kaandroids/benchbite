import { useTranslation } from 'react-i18next';

import { isoWeekday, useClockFormat, useShortDateFormat, useWeekdayFormat } from '@/i18n/dates';

import { dayKind } from './thread-groups';

/**
 * Formats when something was written in a chat, as of now: "Today 08:30", "Yesterday 18:12", the
 * weekday within a week, else the date, each with the time. Now is read each time, so that a screen
 * open over midnight says yesterday for what was today.
 */
export function useMomentFormat() {
  const { t } = useTranslation();
  const clock = useClockFormat();
  const weekday = useWeekdayFormat();
  const date = useShortDateFormat(new Date());
  return (moment: Date) => {
    const time = clock(moment);
    switch (dayKind(moment, new Date())) {
      case 'today':
        return t('bite.moment.today', { time });
      case 'yesterday':
        return t('bite.moment.yesterday', { time });
      case 'week':
        return t('bite.moment.day', { day: weekday(isoWeekday(moment)), time });
      case 'older':
        return t('bite.moment.day', { day: date(moment), time });
    }
  };
}
