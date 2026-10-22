import { buildSession, type SlotUses } from './session.ts';
import { splitFor } from './split.ts';
import type { CatalogueEntry, Plan, PlanInput } from './types.ts';

/**
 * Builds the starter plan: one session for each type in the split for the number of days, done on
 * every day of that type (ADR 0019). The same answers always give the same plan.
 */
export function buildPlan(input: PlanInput, catalogue: CatalogueEntry[]): Plan {
  if (new Set(input.trainingDays).size !== input.trainingDays.length) {
    throw new RangeError('Training days must not repeat');
  }
  const weekdays = [...input.trainingDays].sort((a, b) => a - b);
  const types = splitFor(weekdays.length, input.experience);
  const slotUses: SlotUses = new Map();

  const sessions = [...new Set(types)].map((type) =>
    buildSession(
      input,
      catalogue,
      weekdays.filter((_weekday, index) => types[index] === type),
      type,
      slotUses,
    ),
  );

  return { sessions };
}
