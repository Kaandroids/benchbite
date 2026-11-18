// Withdraws the consent a link from request-consent-withdrawal is for, once the website's page is
// confirmed (#653, ADR 0146).
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import type { Database } from '../_shared/database.types.ts';
import { siteUrl } from '../_shared/site.ts';
import { handleWithdrawalConfirm } from './handler.ts';

export default {
  // As confirm-account-deletion (ADR 0094): the link's token is the proof, as people without the
  // app have no session; it is long, random, works once and for 30 minutes. The platform's JWT
  // check is off, as a form sends none, and CORS is off, as no script reads the answer.
  fetch: withSupabase<Database>({ auth: 'none', cors: 'disabled' }, (req, ctx) =>
    handleWithdrawalConfirm(req, { admin: ctx.supabaseAdmin, siteUrl: siteUrl() }),
  ),
};
