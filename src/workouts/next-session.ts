import { isoWeekday } from '@/i18n/dates';

/** The next session of a week from the given day on, today included, and in how many days. */
export function nextSession<S extends { weekday: number }>(
  week: { sessions: S[] },
  today: Date,
): { session: S; inDays: number } | null {
  const weekday = isoWeekday(today);
  let best: { session: S; inDays: number } | null = null;
  for (const session of week.sessions) {
    const inDays = (session.weekday - weekday + 7) % 7;
    if (!best || inDays < best.inDays) {
      best = { session, inDays };
    }
  }
  return best;
}
