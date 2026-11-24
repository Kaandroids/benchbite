// The work of export-my-data (#712, ADR 0168, ADR 0169): the signed-in user's export as a ZIP in
// storage, the same as the website's link gives (ADR 0148), and a link to download it.
import { storeExport } from '../_shared/data_export_zip.ts';
import { type Client, logError } from '../_shared/supabase.ts';

export type ExportContext = {
  /** A client with the user's own token, which export_my_data() reads as. */
  supabase: Client;
  /** A client with the service role, which takes the limit and reads and writes the files. */
  admin: Client;
  /** The user the request's token belongs to. */
  userId: string;
  /** STORAGE_PUBLIC_URL, set only locally. */
  publicUrl?: string;
  now?: () => Date;
};

export async function handleExport(
  req: Request,
  { supabase, admin, userId, publicUrl, now = () => new Date() }: ExportContext,
): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  // Two an hour: each reads every file the user has.
  const { data: taken, error: limitError } = await admin.rpc('take_data_export', {
    p_user: userId,
  });
  if (limitError) {
    logError('Taking an export failed', limitError);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
  if (!taken) {
    return Response.json({ error: 'too_many_exports' }, { status: 429 });
  }
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) {
    logError('Exporting the signed-in user failed', error);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
  try {
    return Response.json({ url: await storeExport(admin, userId, data, now(), publicUrl) });
  } catch (cause) {
    logError('Storing an export failed', cause);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
}
