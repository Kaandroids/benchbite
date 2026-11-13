// Deletes the signed-in user, guest or account, and all that is theirs (#134, ADR 0087). An account
// proves its owner asks with a code from its email or by signing in with its password (#438, ADR
// 0095, ADR 0127).
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import type { Database } from '../_shared/database.types.ts';
import { handleDeleteRequest, passwordSignInFromClaims } from './handler.ts';

export default {
  // Only signed-in users, anonymous ones included, can call it, and it deletes only the user the
  // token belongs to, a guest or an account as stored, whatever the token says (#528). Deleting a
  // user takes the service role. CORS is off, because only the native app calls the function.
  fetch: withSupabase<Database>({ auth: 'user', cors: 'disabled' }, (req, ctx) =>
    handleDeleteRequest(req, {
      admin: ctx.supabaseAdmin,
      userId: ctx.userClaims!.id,
      passwordSignInAt: passwordSignInFromClaims(ctx.jwtClaims),
    }),
  ),
};
