// Estimates a meal from photos of it (#299, ADR 0059), for the user to check before it is logged.
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import { supportedOnly } from '../_shared/app_version.ts';
import type { Database } from '../_shared/database.types.ts';
import { handleEstimateRequest } from './handler.ts';

export default {
  // Only signed-in users can call it; guests are refused by ai_access(). The foods are searched
  // with the user's token, so row level security applies; the call's usage is recorded with the
  // service role (ADR 0051). CORS is off, because only the native app calls the function.
  // A build of the app that is no longer supported is refused first (ADR 0157).
  fetch: withSupabase<Database>(
    { auth: 'user', cors: 'disabled' },
    supportedOnly((req, ctx) =>
      handleEstimateRequest(req, { supabase: ctx.supabase, admin: ctx.supabaseAdmin }),
    ),
  ),
};
