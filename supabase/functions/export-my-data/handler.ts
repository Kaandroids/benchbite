// The work of export-my-data (#712, ADR 0168): the signed-in user's export as a ZIP, the same as
// the website's link gives (ADR 0148).
import { exportZip, zipResponse } from '../_shared/data_export_zip.ts';
import { type Client, logError } from '../_shared/supabase.ts';

export type ExportContext = {
  /** A client with the user's own token, which export_my_data() reads as. */
  supabase: Client;
  /** A client with the service role, which reads the user's files in the private buckets. */
  admin: Client;
  now?: () => Date;
};

export async function handleExport(
  req: Request,
  { supabase, admin, now = () => new Date() }: ExportContext,
): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) {
    logError('Exporting the signed-in user failed', error);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
  return zipResponse(exportZip(admin, data), now());
}
