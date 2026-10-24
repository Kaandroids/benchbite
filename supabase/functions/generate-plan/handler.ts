// The request handling of generate-plan, apart from signing in, so that it can be tested with a
// stand-in for the database.
import type { SupabaseContext } from '@supabase/server';
import { z } from 'zod';

import { Constants, type Database } from '../_shared/database.types.ts';
import { MAX_TRAINING_DAYS, SESSION_MINUTES } from '../_shared/plan/limits.ts';
import { buildPlan } from '../_shared/plan/plan.ts';
import type { CatalogueEntry } from '../_shared/plan/types.ts';

// The allowed values come from the generated database types, so a new enum value is accepted
// as soon as the types are regenerated.
const { Enums } = Constants.public;

const PlanRequest = z.object({
  goal: z.enum(Enums.goal_kind),
  experience: z.enum(Enums.experience),
  trainingDays: z
    .array(z.number().int().min(1).max(7))
    .min(1)
    .max(MAX_TRAINING_DAYS)
    .refine((days) => new Set(days).size === days.length, 'Training days must be unique'),
  setup: z.enum(Enums.training_setup),
  sessionMinutes: z.literal(SESSION_MINUTES),
});

/** Builds the plan for the answers in the request, from the catalogue the user may read. */
export async function handlePlanRequest(
  req: Request,
  supabase: Pick<SupabaseContext<Database>['supabase'], 'from'>,
): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }

  const parsed = PlanRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      {
        error: 'invalid_request',
        issues: z.flattenError(parsed.error).fieldErrors,
      },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from('plan_slot_exercises')
    .select('slot, exercise_id, requires, min_experience, priority, exercises (metrics)');
  if (error) {
    console.error('Could not load the plan slot catalogue', error);
    return Response.json({ error: 'catalogue_unavailable' }, { status: 500 });
  }

  const catalogue: CatalogueEntry[] = data.map((row) => ({
    slot: row.slot,
    exerciseId: row.exercise_id,
    requires: row.requires,
    minExperience: row.min_experience,
    priority: row.priority,
    metrics: row.exercises.metrics,
  }));

  return Response.json(buildPlan(parsed.data, catalogue));
}
