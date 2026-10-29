import { useState } from 'react';

import { addDays, daysBetween, fromIsoDate, weekStart } from '@/i18n/dates';
import { useStreakStart } from '@/streak/use-streak';

/**
 * The week the Today tab shows, paged back one week at a time to the user's first week and
 * forward to today's (ADR 0043). A pager is absent where it cannot go.
 */
export function useWeekPaging(today: Date) {
  // How many weeks back the week shown is, 0 for this week.
  const [weeksBack, setWeeksBack] = useState(0);
  const startedOn = useStreakStart().data ?? undefined;
  const firstWeeksBack = startedOn
    ? Math.max(0, Math.round(daysBetween(weekStart(fromIsoDate(startedOn)), weekStart(today)) / 7))
    : 0;
  return {
    weeksBack,
    /** A day of the week shown. */
    week: addDays(today, -7 * weeksBack),
    /** The user's first day, YYYY-MM-DD. */
    startedOn,
    onPrevious: weeksBack < firstWeeksBack ? () => setWeeksBack((back) => back + 1) : undefined,
    onNext: weeksBack > 0 ? () => setWeeksBack((back) => back - 1) : undefined,
    onBackToToday: weeksBack > 0 ? () => setWeeksBack(0) : undefined,
  };
}
