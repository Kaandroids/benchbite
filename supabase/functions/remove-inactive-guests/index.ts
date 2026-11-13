// Deletes guests nobody has used for 90 days (#535, ADR 0131). A pg_cron job calls it while there
// are any.
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import type { Database } from '../_shared/database.types.ts';
import { handleRemovalRequest } from './handler.ts';

export default {
  // Only the scheduler calls it, with the project's secret API key, as it does purge-coach-media.
  fetch: withSupabase<Database>({ auth: 'secret', cors: 'disabled' }, (req, ctx) =>
    handleRemovalRequest(req, { admin: ctx.supabaseAdmin }),
  ),
};
