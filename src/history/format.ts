import { useTranslation } from 'react-i18next';

import { weekStart } from './history';

/** A length of time in minutes, such as "52 min" or "2 h 41 min". */
export function useDurationFormat() {
  const { t } = useTranslation();
  return (minutes: number) =>
    minutes < 60
      ? t('history.minutes', { minutes })
      : t('history.hours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

/** A week's title: this week, last week, or its days, such as "October 6 – 12". */
export function useWeekTitle(today = new Date()) {
  const { t, i18n } = useTranslation();
  const formatter = new Intl.DateTimeFormat(i18n.language, { month: 'long', day: 'numeric' });
  const thisWeek = weekStart(today).getTime();
  return (start: Date) => {
    const weeksAgo = Math.round((thisWeek - start.getTime()) / (7 * 24 * 3600 * 1000));
    if (weeksAgo === 0) {
      return t('history.weekThis');
    }
    if (weeksAgo === 1) {
      return t('history.weekLast');
    }
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return formatter.formatRange
      ? formatter.formatRange(start, end)
      : `${formatter.format(start)} – ${formatter.format(end)}`;
  };
}
