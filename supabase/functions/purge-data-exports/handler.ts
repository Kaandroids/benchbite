// The work of purge-data-exports (#712, ADR 0169): removes the export ZIPs made more than a day
// ago, as they hold health data. A pg_cron job calls it while there are any.
import { EXPORTS_BUCKET } from '../_shared/data_export_zip.ts';
import { type Client, logError } from '../_shared/supabase.ts';

/** ZIPs removed per run, well within the scheduled call's time. */
export const BATCH_SIZE = 100;

export async function handlePurgeExports(req: Request, admin: Client): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  const { data: stale, error } = await admin.rpc('stale_data_exports', { p_limit: BATCH_SIZE });
  if (error) {
    logError('Finding the exports to purge failed', error);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
  if (stale.length === 0) return Response.json({ purged: 0 });
  const { data: removed, error: removeError } = await admin.storage
    .from(EXPORTS_BUCKET)
    .remove(stale);
  if (removeError) {
    logError('Purging exports failed', removeError);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
  return Response.json({ purged: removed.length });
}
