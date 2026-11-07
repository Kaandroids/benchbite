// Deletes the account a link from request-account-deletion belongs to, once the website's page is
// confirmed (#449, ADR 0094).
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import type { Database } from '../_shared/database.types.ts';
import { siteUrl } from '../_shared/site.ts';
import { handleDeletionConfirm } from './handler.ts';

export default {
  // The link's token is the proof, as people without the app have no session; it is long, random,
  // works once and for 30 minutes. The platform's JWT check is off, as a form sends none. CORS is
  // off: the browser posts the form and follows the redirect, and no script reads the answer.
  fetch: withSupabase<Database>({ auth: 'none', cors: 'disabled' }, (req, ctx) =>
    handleDeletionConfirm(req, { admin: ctx.supabaseAdmin, siteUrl: siteUrl() }),
  ),
};
