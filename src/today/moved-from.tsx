import { useTranslation } from 'react-i18next';

import { Tag } from '@/components/ui/tag';
import { useWeekdayFormat, weekdayOf } from '@/i18n/dates';

/** "Moved from Monday", for a workout moved to another day. */
export function MovedFrom({ date }: { date: string }) {
  const { t } = useTranslation();
  const weekdayName = useWeekdayFormat();
  return (
    <Tag icon="arrow" label={t('today.workout.movedFrom', { day: weekdayName(weekdayOf(date)) })} />
  );
}
