// Emails the owner when an account's password is saved (#481, ADR 0167): a welcome for its first
// password, and a notice for a change. A trigger on auth.users calls it.
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import type { Database } from '../_shared/database.types.ts';
import { emailSender } from '../_shared/email.ts';
import { handlePasswordEmail } from './handler.ts';

export default {
  // Only the database calls it, with the project's secret API key in the apikey header, which is
  // compared in constant time; the platform's JWT check is off, as the key is no JWT. Users and the
  // publishable key are refused. CORS is off, because no browser calls the function.
  fetch: withSupabase<Database>({ auth: 'secret', cors: 'disabled' }, (req, ctx) =>
    handlePasswordEmail(req, { admin: ctx.supabaseAdmin, send: emailSender() }),
  ),
};
