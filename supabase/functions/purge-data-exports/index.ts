// Removes the export ZIPs made more than a day ago, which a pg_cron job asks for, or one user's,
// which the withdrawal of their health data consent asks for (#712, ADR 0169).
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import type { Database } from '../_shared/database.types.ts';
import { handlePurgeExports } from './handler.ts';

export default {
  // Only the database calls it, from the scheduler or a withdrawal, with the project's secret API
  // key in the apikey header, which is compared in constant time; the platform's JWT check is off,
  // as the key is no JWT. Users and the publishable key are refused. CORS is off, because no
  // browser calls the function.
  fetch: withSupabase<Database>({ auth: 'secret', cors: 'disabled' }, (req, ctx) =>
    handlePurgeExports(req, ctx.supabaseAdmin),
  ),
};
