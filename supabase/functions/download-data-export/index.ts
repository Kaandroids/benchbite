// Gives the data of the account a link from request-data-export belongs to, as a file, once the
// website's page asks for it (#553, ADR 0148).
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import type { Database } from '../_shared/database.types.ts';
import { siteUrl } from '../_shared/site.ts';
import { handleExportDownload } from './handler.ts';

export default {
  // As confirm-account-deletion (ADR 0094): the link's token is the proof, as people without the
  // app have no session; it is long, random and works for 30 minutes. The platform's JWT check is
  // off, as a form sends none, and CORS is off: the browser saves the answer, and no script reads it.
  fetch: withSupabase<Database>({ auth: 'none', cors: 'disabled' }, (req, ctx) =>
    handleExportDownload(req, {
      admin: ctx.supabaseAdmin,
      siteUrl: siteUrl(),
      publicUrl: Deno.env.get('STORAGE_PUBLIC_URL'),
    }),
  ),
};
