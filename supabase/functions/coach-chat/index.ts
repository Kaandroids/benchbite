// Answers the user's message to Bite, the AI coach, as a stream of events (#292, ADR 0052).
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import { supportedOnly } from '../_shared/app_version.ts';
import type { Database } from '../_shared/database.types.ts';
import { handleChatRequest } from './handler.ts';

export default {
  // Only signed-in users can call it; guests are refused by ai_access(). The database is read
  // with the user's token, so row level security applies; threads and messages are written with
  // the service role (ADR 0050). CORS is off, because only the native app calls the function.
  // A build of the app that is no longer supported is refused first (ADR 0157).
  fetch: withSupabase<Database>(
    { auth: 'user', cors: 'disabled' },
    supportedOnly((req, ctx) =>
      handleChatRequest(req, {
        supabase: ctx.supabase,
        admin: ctx.supabaseAdmin,
        userId: ctx.userClaims!.id,
      }),
    ),
  ),
};
