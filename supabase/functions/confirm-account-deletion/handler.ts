// The work of confirm-account-deletion (#449, ADR 0094): the page the email's link opened sends its
// token, and the account it belongs to is deleted, as from the app (ADR 0087).
import { deleteUser } from '../_shared/delete_user.ts';
import { sha256Hex } from '../_shared/hash.ts';
import { readForm } from '../_shared/request.ts';
import { redirect, siteLocale, sitePage } from '../_shared/site.ts';
import { type Client, logError } from '../_shared/supabase.ts';

export type ConfirmContext = {
  /** A client with the service role, which alone reads links and deletes users. */
  admin: Client;
  siteUrl: string;
};

export async function handleDeletionConfirm(
  req: Request,
  { admin, siteUrl }: ConfirmContext,
): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  const form = await readForm(req);
  const locale = siteLocale(form.get('locale'));
  const token = form.get('token') ?? '';
  const page = (path: string) => redirect(sitePage(siteUrl, locale, path));
  // Back to the page with its token, in the fragment that stays in the browser, to try again.
  const failed = () => page(`delete-account/confirm#token=${token}&failed`);

  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return page('delete-account/expired');
  }
  const { data: userId, error } = await admin.rpc('account_deletion_user', {
    p_token_hash: await sha256Hex(token),
  });
  if (error) {
    logError('Reading a link to delete an account failed', error);
    return failed();
  }
  if (!userId) {
    return page('delete-account/expired');
  }
  // The link goes with the user, so it works once; if deleting fails it still works, for a retry.
  return (await deleteUser(admin, userId)) ? page('delete-account/done') : failed();
}
