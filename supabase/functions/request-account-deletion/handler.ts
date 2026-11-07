// The work of request-account-deletion (#449, ADR 0094): the website's form asks for a link to delete
// the account of an email address. The answer is the same page, after the same time, whether or not
// the address has an account, so the form tells nobody which addresses have one.
import type { Send } from '../_shared/email.ts';
import { readForm, redirect, sha256Hex, siteLocale, sitePage } from '../_shared/site.ts';
import { type Client, logError } from '../_shared/supabase.ts';
import { deletionEmail } from './email.ts';

export type RequestContext = {
  /** A client with the service role, which alone makes links. */
  admin: Client;
  send: Send;
  siteUrl: string;
  /** The least time an answer takes, so that sending an email does not show in its timing. */
  minimumMs?: number;
  wait?: (ms: number) => Promise<void>;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A token nobody can guess: 32 random bytes, as base64url. */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function handleDeletionRequest(
  req: Request,
  { admin, send, siteUrl, minimumMs = 1500, wait = sleep }: RequestContext,
): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  const started = Date.now();
  const form = await readForm(req);
  const locale = siteLocale(form.get('locale'));
  const email = (form.get('email') ?? '').trim();

  if (email.includes('@') && email.length <= 254) {
    try {
      const token = newToken();
      // The first address is the client's; the platform's proxy adds its own after it.
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
      const { data: made, error } = await admin.rpc('start_account_deletion', {
        p_email: email,
        p_ip_hash: await sha256Hex(ip),
        p_token_hash: await sha256Hex(token),
      });
      if (error) {
        logError('Starting the deletion of an account failed', error);
      } else if (made) {
        // In the fragment, which browsers never send to a server, so no log holds the token.
        const link = `${sitePage(siteUrl, locale, 'delete-account/confirm')}#token=${token}`;
        await send(deletionEmail(locale, email.toLowerCase(), link));
      }
    } catch (cause) {
      logError('Sending the link to delete an account failed', cause);
    }
  }

  await wait(Math.max(0, minimumMs - (Date.now() - started)));
  return redirect(sitePage(siteUrl, locale, 'delete-account/sent'));
}
