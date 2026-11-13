// Emails the signed-in account a code that confirms deleting it from the app (#438, ADR 0095).
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import type { Database } from '../_shared/database.types.ts';
import { emailSender } from '../_shared/email.ts';
import { handleSendCode } from './handler.ts';

export default {
  // Only signed-in users can call it, and it sends only to the stored address of the user the
  // token belongs to (#528). Keeping codes takes the service role. CORS is off, because only the native app
  // calls the function.
  fetch: withSupabase<Database>({ auth: 'user', cors: 'disabled' }, (req, ctx) =>
    handleSendCode(req, {
      admin: ctx.supabaseAdmin,
      send: emailSender(),
      userId: ctx.userClaims!.id,
    }),
  ),
};
