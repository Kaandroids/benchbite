// The work of download-data-export (#553, ADR 0148): the page the email's link opened sends its
// token, and the answer sends the browser to the account's export, a ZIP with its photos and voice
// messages in storage, the same as the app's (ADR 0168, ADR 0169), two an hour.
import { storeExport } from '../_shared/data_export_zip.ts';
import { isObject } from '../_shared/json.ts';
import { sha256Hex } from '../_shared/hash.ts';
import { readForm } from '../_shared/request.ts';
import { redirect, siteLocale, sitePage } from '../_shared/site.ts';
import { isLinkToken } from '../_shared/site_link.ts';
import { type Client, logError } from '../_shared/supabase.ts';

export type DownloadContext = {
  /** A client with the service role, which alone reads links, and reads the account's files. */
  admin: Client;
  siteUrl: string;
  /** STORAGE_PUBLIC_URL, set only locally. */
  publicUrl?: string;
  now?: () => Date;
};

export async function handleExportDownload(
  req: Request,
  { admin, siteUrl, publicUrl, now = () => new Date() }: DownloadContext,
): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  const form = await readForm(req);
  const locale = siteLocale(form.get('locale'));
  const token = form.get('token') ?? '';
  const page = (path: string) => redirect(sitePage(siteUrl, locale, path));

  if (!isLinkToken(token)) {
    return page('export-data/expired');
  }
  const { data, error } = await admin.rpc('export_data_by_link', {
    p_token_hash: await sha256Hex(token),
  });
  if (error) {
    logError('Exporting an account by link failed', error);
    // Back to the page with its token, in the fragment that stays in the browser, to try again.
    return page(`export-data/download#token=${token}&failed`);
  }
  if (!data) {
    return page('export-data/expired');
  }
  const account = isObject(data) && isObject(data.account) ? data.account.id : undefined;
  if (typeof account !== 'string') {
    logError('An export by link names no account', null);
    return page(`export-data/download#token=${token}&failed`);
  }
  // Two an hour, as from the app: each reads every file the account has.
  const { data: taken, error: limitError } = await admin.rpc('take_data_export', {
    p_user: account,
  });
  if (limitError) {
    logError('Taking an export failed', limitError);
    return page(`export-data/download#token=${token}&failed`);
  }
  if (!taken) {
    return page(`export-data/download#token=${token}&limit`);
  }
  try {
    // The browser downloads the ZIP from storage, which no time limit cuts off (ADR 0169).
    return redirect(await storeExport(admin, account, data, now(), publicUrl));
  } catch (cause) {
    logError('Storing an export failed', cause);
    return page(`export-data/download#token=${token}&failed`);
  }
}
