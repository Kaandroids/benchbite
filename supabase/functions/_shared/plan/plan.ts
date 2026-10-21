import { buildSession } from './session.ts';
import { splitFor } from './split.ts';
import type { CatalogueEntry, Plan, PlanInput, SessionType } from './types.ts';

/**
 * Builds the starter plan: one session for each training day, following the split for the
 * number of days. The same answers always give the same plan.
 */
export function buildPlan(input: PlanInput, catalogue: CatalogueEntry[]): Plan {
  const weekdays = [...new Set(input.trainingDays)].sort((a, b) => a - b);
  const types = splitFor(weekdays.length, input.experience);
  const seen = new Map<SessionType, number>();

  const sessions = weekdays.map((weekday, index) => {
    const type = types[index]!;
    const variant = seen.get(type) ?? 0;
    seen.set(type, variant + 1);
    return buildSession(input, catalogue, weekday, type, variant);
  });

  return { sessions };
}
