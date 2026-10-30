// Removes the photos of deleted chats from coach-media (#361, ADR 0063). A pg_cron job calls it
// while folders are queued.
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import type { Database } from '../_shared/database.types.ts';
import { handlePurgeRequest } from './handler.ts';

export default {
  // Only the scheduler calls it, with the project's secret API key in the apikey header, which
  // is compared in constant time; the platform's JWT check is off, as the key is no JWT. Users and
  // the publishable key are refused. CORS is off, because no browser calls the function.
  fetch: withSupabase<Database>({ auth: 'secret', cors: 'disabled' }, (req, ctx) =>
    handlePurgeRequest(req, { admin: ctx.supabaseAdmin }),
  ),
};
