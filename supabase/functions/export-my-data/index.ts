// The signed-in user's export as a ZIP, with their photos and voice messages, written to storage
// and downloaded from there, two an hour (#712, ADR 0168, ADR 0169).
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import type { Database } from '../_shared/database.types.ts';
import { handleExport } from './handler.ts';

export default {
  // Only signed-in users can call it, guests too, and it exports only the user the token belongs
  // to: export_my_data() reads as them. The service role only reads their files, which the export
  // lists. CORS is off, because only the native app calls the function.
  // Not refused for a build that is no longer supported (ADR 0157): a copy stays possible.
  fetch: withSupabase<Database>({ auth: 'user', cors: 'disabled' }, (req, ctx) =>
    handleExport(req, {
      supabase: ctx.supabase,
      admin: ctx.supabaseAdmin,
      userId: ctx.userClaims!.id,
      publicUrl: Deno.env.get('STORAGE_PUBLIC_URL'),
    }),
  ),
};
