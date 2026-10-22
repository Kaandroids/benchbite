import { isoWeekday } from '@/i18n/dates';
import type { Plan, Session } from '@shared/plan/types';

/** The next session of the plan from the given day on, today included, and in how many days. */
export function nextSession(plan: Plan, today: Date): { session: Session; inDays: number } | null {
  const weekday = isoWeekday(today);
  let best: { session: Session; inDays: number } | null = null;
  for (const session of plan.sessions) {
    const inDays = (session.weekday - weekday + 7) % 7;
    if (!best || inDays < best.inDays) {
      best = { session, inDays };
    }
  }
  return best;
}
