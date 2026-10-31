// The local Supabase stack, for the scripts that call it. SUPABASE_URL and
// SUPABASE_PUBLISHABLE_KEY point them at another stack.

export const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
// The local stack's fixed development key, as in .env.example.
export const KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

/** Whether URL is a stack on this computer. */
export const isLocal = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL);
