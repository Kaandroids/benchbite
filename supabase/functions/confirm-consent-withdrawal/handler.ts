// The work of confirm-consent-withdrawal (#653, ADR 0146): the page the email's link opened sends
// its token and its consent, and the database withdraws it, as the app does (ADR 0143, ADR 0144).
import { consentOf } from '../_shared/consents.ts';
import { sha256Hex } from '../_shared/hash.ts';
import { readForm } from '../_shared/request.ts';
import { redirect, siteLocale, sitePage } from '../_shared/site.ts';
import { isLinkToken } from '../_shared/site_link.ts';
import { type Client, logError } from '../_shared/supabase.ts';

export type ConfirmContext = {
  /** A client with the service role, which alone reads links. */
  admin: Client;
  siteUrl: string;
};

export async function handleWithdrawalConfirm(
  req: Request,
  { admin, siteUrl }: ConfirmContext,
): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  const form = await readForm(req);
  const locale = siteLocale(form.get('locale'));
  const token = form.get('token') ?? '';
  const consent = consentOf(form.get('consent'));
  const page = (path: string) => redirect(sitePage(siteUrl, locale, path));

  if (!consent || !isLinkToken(token)) {
    return page('withdraw-consent/expired');
  }
  // The link is used up only with the withdrawal, so one that failed still works.
  const { data: withdrawn, error } = await admin.rpc('withdraw_consent_by_link', {
    p_token_hash: await sha256Hex(token),
    p_consent: consent,
  });
  if (error) {
    logError('Withdrawing a consent by link failed', error);
    // Back to the page with its token, in the fragment that stays in the browser, to try again.
    return page(`withdraw-consent/${consent}#token=${token}&failed`);
  }
  return page(withdrawn ? 'withdraw-consent/done' : 'withdraw-consent/expired');
}
