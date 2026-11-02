import { useTranslation } from 'react-i18next';

import {
  daysBetween,
  fromIsoDate,
  isoWeekday,
  useShortDateFormat,
  useWeekdayFormat,
} from '@/i18n/dates';

import type { Note } from './notebook';
import { dayKind } from './thread-groups';

/**
 * Where a note came from, and on what day: "From a chat · Oct 12", or Today and Yesterday by name.
 * Now is read each time, so that a notebook open over midnight stays right.
 */
export function useNoteSource() {
  const { t } = useTranslation();
  const date = useShortDateFormat(new Date());
  return (note: Note) => {
    const kind = dayKind(note.createdAt, new Date());
    const when =
      kind === 'today'
        ? t('bite.notebook.today')
        : kind === 'yesterday'
          ? t('bite.notebook.yesterday')
          : date(note.createdAt);
    return t(`bite.notebook.sources.${note.source}`, { when });
  };
}

/**
 * When Bite asks again whether a note still holds, for its tag and its sheet: on a weekday within
 * the week ahead, on a date after it, or, once the day has come, the next time the user chats, as
 * Bite asks then.
 */
export function useReviewText() {
  const { t } = useTranslation();
  const weekday = useWeekdayFormat('long');
  const date = useShortDateFormat(new Date());
  // The day ahead, or nothing once it has come.
  const dayAhead = (reviewOn: string) => {
    const on = fromIsoDate(reviewOn);
    const ahead = -daysBetween(on, new Date());
    if (ahead <= 0) return undefined;
    return ahead < 7 ? weekday(isoWeekday(on)) : date(on);
  };
  return {
    tag: (reviewOn: string) => {
      const day = dayAhead(reviewOn);
      return day ? t('bite.notebook.askAgain', { day }) : t('bite.notebook.askNext');
    },
    sheet: (reviewOn: string) => {
      const day = dayAhead(reviewOn);
      return day ? t('bite.notebook.asksAgain', { day }) : t('bite.notebook.asksNext');
    },
  };
}
