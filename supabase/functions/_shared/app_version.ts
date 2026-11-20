// Refusing a build of the app that is no longer supported (#687, ADR 0157), as the Data API does
// with check_app_version(): the app names its platform and version in two headers of every
// request. A request without them passes, and so does one the database cannot be asked about, as
// the check must not stop the app by mistake.
import { type Client, logError } from './supabase.ts';

/** What the app answers by asking what it has to hold to, which shows it the update screen. */
export const UNSUPPORTED_VERSION = 'unsupported_version';

/** The refusal for a request from an unsupported build, or null for one that may go on. */
export async function refusedVersion(req: Request, supabase: Client): Promise<Response | null> {
  const platform = req.headers.get('x-app-platform');
  const version = req.headers.get('x-app-version');
  if (!platform || !version) return null;
  const { data, error } = await supabase.rpc('app_version_supported', {
    platform,
    app_version: version,
  });
  if (error) {
    logError('Could not check the app version', error);
    return null;
  }
  return data === false ? Response.json({ error: UNSUPPORTED_VERSION }, { status: 426 }) : null;
}

/** A handler that only runs for builds of the app that are still supported. */
export function supportedOnly<Context extends { supabase: Client }>(
  handler: (req: Request, ctx: Context) => Response | Promise<Response>,
): (req: Request, ctx: Context) => Promise<Response> {
  return async (req, ctx) => (await refusedVersion(req, ctx.supabase)) ?? handler(req, ctx);
}
