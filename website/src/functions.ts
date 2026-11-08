// The address of the Supabase Edge Functions that the forms post to (ADR 0094). The deploy takes it
// from the repository variable SUPABASE_FUNCTIONS_URL and stops without it; a build without it, as
// locally and in CI, posts to the local stack.
const configured: string | undefined = import.meta.env.PUBLIC_FUNCTIONS_URL;

export const FUNCTIONS_URL = (configured || 'http://127.0.0.1:54321/functions/v1').replace(
  /\/$/,
  '',
);
