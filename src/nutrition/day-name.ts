import { useTranslation } from 'react-i18next';

import { isoWeekday, useWeekdayFormat } from '@/i18n/dates';

/** Names a logged day by how far back it is: Today, Yesterday, or its weekday. */
export function useDayName() {
  const { t } = useTranslation();
  const weekday = useWeekdayFormat();
  return (day: Date, daysBack: number) =>
    daysBack === 0
      ? t('nutrition.day.today')
      : daysBack === 1
        ? t('nutrition.day.yesterday')
        : weekday(isoWeekday(day));
}
