// Sends a link to withdraw a consent of the account of an email address, asked for by the
// website's form (#653, ADR 0146).
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import type { Database } from '../_shared/database.types.ts';
import { emailSender } from '../_shared/email.ts';
import { siteUrl } from '../_shared/site.ts';
import { handleWithdrawalRequest } from './handler.ts';

// The runtime's own global, which its imported type file does not declare for this check.
declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void };

export default {
  // As request-account-deletion (ADR 0094): anyone can ask, the function answers the same for
  // every address and limits requests per address and IP. The platform's JWT check is off, as a
  // form sends none, and CORS is off, as no script reads the answer.
  fetch: withSupabase<Database>({ auth: 'none', cors: 'disabled' }, (req, ctx) =>
    handleWithdrawalRequest(req, {
      admin: ctx.supabaseAdmin,
      send: emailSender(),
      inBackground: (work) => EdgeRuntime.waitUntil(work),
      siteUrl: siteUrl(),
    }),
  ),
};
