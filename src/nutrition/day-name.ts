import { useTranslation } from 'react-i18next';

import { isoWeekday, useDayFormat, useMonthDayFormat, useWeekdayFormat } from '@/i18n/dates';

/**
 * Names a logged day by how far back it is: Today or Yesterday, or its weekday, and dates it under
 * that name without saying the weekday twice: "Today", "Wednesday, October 28", but "Sunday",
 * "October 25".
 */
export function useDayLabel() {
  const { t } = useTranslation();
  const weekday = useWeekdayFormat();
  const fullDate = useDayFormat();
  const monthDay = useMonthDayFormat();
  return (day: Date, daysBack: number) => {
    const relative =
      daysBack === 0
        ? t('nutrition.day.today')
        : daysBack === 1
          ? t('nutrition.day.yesterday')
          : null;
    return relative
      ? { name: relative, date: fullDate(day) }
      : { name: weekday(isoWeekday(day)), date: monthDay(day) };
  };
}

/** Names a logged day by how far back it is: Today, Yesterday, or its weekday. */
export function useDayName() {
  const dayLabel = useDayLabel();
  return (day: Date, daysBack: number) => dayLabel(day, daysBack).name;
}
