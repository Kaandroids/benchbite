import type { Plan, Session } from '@shared/plan/types';

/** A training day of the plan, with the session done on it. */
export type PlanDay = Omit<Session, 'weekdays'> & { weekday: number };

/** The plan's training days in weekday order; a session done on two days appears twice. */
export function planDays(plan: Plan): PlanDay[] {
  return plan.sessions
    .flatMap(({ weekdays, ...session }) => weekdays.map((weekday) => ({ ...session, weekday })))
    .sort((a, b) => a.weekday - b.weekday);
}
