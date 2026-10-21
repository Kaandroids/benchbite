import { buildSession, type SlotUses } from './session.ts';
import { splitFor } from './split.ts';
import type { CatalogueEntry, Plan, PlanInput } from './types.ts';

/**
 * Builds the starter plan: one session for each training day, following the split for the
 * number of days. The same answers always give the same plan.
 */
export function buildPlan(input: PlanInput, catalogue: CatalogueEntry[]): Plan {
  const weekdays = [...new Set(input.trainingDays)].sort((a, b) => a - b);
  const types = splitFor(weekdays.length, input.experience);
  const slotUses: SlotUses = new Map();

  const sessions = weekdays.map((weekday, index) =>
    buildSession(input, catalogue, weekday, types[index]!, slotUses),
  );

  return { sessions };
}
