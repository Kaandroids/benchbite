import type { Plan, Session } from '@shared/plan/types';

import { nextSession } from './next-session';

const session = (weekday: number): Session => ({
  weekday,
  type: 'full_body',
  exercises: [],
  finisher: null,
  estimatedMinutes: 45,
});

const plan = (...weekdays: number[]): Plan => ({ sessions: weekdays.map(session) });

// A Wednesday.
const WEDNESDAY = new Date(2026, 9, 21, 9, 0);

describe('nextSession', () => {
  it('is today when there is a session today', () => {
    expect(nextSession(plan(1, 3, 5), WEDNESDAY)).toEqual({ session: session(3), inDays: 0 });
  });

  it('is the next session later in the week', () => {
    expect(nextSession(plan(1, 5), WEDNESDAY)).toEqual({ session: session(5), inDays: 2 });
  });

  it('continues into next week', () => {
    expect(nextSession(plan(1, 2), WEDNESDAY)).toEqual({ session: session(1), inDays: 5 });
  });

  it('is null without sessions', () => {
    expect(nextSession(plan(), WEDNESDAY)).toBeNull();
  });
});
