// Deletes the signed-in user, guest or account, and all that is theirs (#134, ADR 0087). An account
// proves its owner asks with a code from its email or its password (#438, ADR 0095).
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { createContextClient } from '@supabase/server/core';

import type { Database } from '../_shared/database.types.ts';
import { handleDeleteRequest, type PasswordCheck } from './handler.ts';

/**
 * Signs in with the password on a client of its own, which is dropped after: on the service role's
 * client, the session would replace the service role for the calls after it.
 */
async function checkPassword(email: string, password: string): Promise<PasswordCheck> {
  const { error } = await createContextClient().auth.signInWithPassword({ email, password });
  if (!error) return 'right';
  if (error.code === 'invalid_credentials') return 'wrong';
  if (error.status === 429) return 'busy';
  throw error;
}

export default {
  // Only signed-in users, anonymous ones included, can call it, and it deletes only the user the
  // token belongs to, a guest or an account as stored, whatever the token says (#528). Deleting a user takes the service role. CORS is off, because only the native
  // app calls the function.
  fetch: withSupabase<Database>({ auth: 'user', cors: 'disabled' }, (req, ctx) =>
    handleDeleteRequest(req, {
      admin: ctx.supabaseAdmin,
      userId: ctx.userClaims!.id,
      checkPassword,
    }),
  ),
};
