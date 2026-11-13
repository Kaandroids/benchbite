// The address of the Supabase Edge Functions that the forms post to (ADR 0094), from the variable
// PUBLIC_FUNCTIONS_URL. The deploy takes it from the repository variable SUPABASE_FUNCTIONS_URL and
// stops without it; a build without it, as locally and in CI, posts to the local stack. The pages
// and the content security policy in astro.config.mjs both read it here, so they cannot differ.

/** The functions' address for the variable as set, or the local stack's. */
export function functionsUrl(configured) {
  return (configured || 'http://127.0.0.1:54321/functions/v1').replace(/\/$/, '');
}
