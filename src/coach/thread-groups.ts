import { daysBetween } from '@/i18n/dates';

import type { ThreadSummary } from './threads';

/** Today, yesterday, the rest of the last week, or a month, by when the last message came. */
export type ThreadGroup =
  | { kind: 'today' | 'yesterday' | 'week'; threads: ThreadSummary[] }
  | { kind: 'month'; month: Date; threads: ThreadSummary[] };

/** How long ago a moment was, by the calendar: today, yesterday, within a week, or before. */
export function dayKind(moment: Date, today: Date): 'today' | 'yesterday' | 'week' | 'older' {
  const days = daysBetween(moment, today);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 7 ? 'week' : 'older';
}

function kindOf(thread: ThreadSummary, today: Date): ThreadGroup['kind'] {
  const kind = dayKind(thread.lastMessageAt, today);
  return kind === 'older' ? 'month' : kind;
}

/**
 * The history's sections, from threads latest first: today, yesterday, the rest of the last
 * week, then a section per month. Sections without a thread are left out.
 */
export function groupThreads(threads: ThreadSummary[], today: Date): ThreadGroup[] {
  const groups: ThreadGroup[] = [];
  for (const thread of threads) {
    const kind = kindOf(thread, today);
    const last = groups.at(-1);
    const month = new Date(thread.lastMessageAt.getFullYear(), thread.lastMessageAt.getMonth(), 1);
    if (
      last &&
      last.kind === kind &&
      (last.kind !== 'month' || last.month.getTime() === month.getTime())
    ) {
      last.threads.push(thread);
    } else if (kind === 'month') {
      groups.push({ kind, month, threads: [thread] });
    } else {
      groups.push({ kind, threads: [thread] });
    }
  }
  return groups;
}

/** How a thread's time is shown in its section: the clock today and yesterday, else the day. */
export function timeKind(thread: ThreadSummary, today: Date): 'clock' | 'weekday' | 'date' {
  const kind = kindOf(thread, today);
  return kind === 'week' ? 'weekday' : kind === 'month' ? 'date' : 'clock';
}
