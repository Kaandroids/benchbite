// Builds the starter workout plan from the onboarding answers. The plan is returned, not
// saved; the onboarding saves it together with the profile.
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import type { Database } from '../_shared/database.types.ts';
import { handlePlanRequest } from './handler.ts';

export default {
  // Only signed-in users, anonymous ones included, can call it. The database is read with the
  // user's token, so row level security applies. CORS is off, because only the native app calls
  // the function and browsers have no reason to.
  fetch: withSupabase<Database>({ auth: 'user', cors: 'disabled' }, (req, ctx) =>
    handlePlanRequest(req, ctx.supabase),
  ),
};
