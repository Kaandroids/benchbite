// The address the forms post to, as src/functions-url.mjs reads it.
import { functionsUrl } from './functions-url.mjs';

export const FUNCTIONS_URL = functionsUrl(import.meta.env.PUBLIC_FUNCTIONS_URL);
