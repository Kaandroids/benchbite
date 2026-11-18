// The work of download-data-export (#553, ADR 0148): the page the email's link opened sends its
// token, and the answer is the account's export as a file, the same as the app's (ADR 0147).
import { sha256Hex } from '../_shared/hash.ts';
import { readForm } from '../_shared/request.ts';
import { redirect, siteLocale, sitePage } from '../_shared/site.ts';
import { isLinkToken } from '../_shared/site_link.ts';
import { type Client, logError } from '../_shared/supabase.ts';

export type DownloadContext = {
  /** A client with the service role, which alone reads links. */
  admin: Client;
  siteUrl: string;
  now?: () => Date;
};

/** The file's name, with the day it was made, as the app names it. */
export const exportFileName = (now: Date) =>
  `benchbite-data-${now.toISOString().slice(0, 10)}.json`;

export async function handleExportDownload(
  req: Request,
  { admin, siteUrl, now = () => new Date() }: DownloadContext,
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
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${exportFileName(now())}"`,
      // Health data: kept by no cache on the way, nor by the browser's.
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
