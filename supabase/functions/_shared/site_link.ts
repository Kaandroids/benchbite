// A link the website's forms ask for by email address: to delete an account (ADR 0094) or to
// withdraw a consent (ADR 0146). The answer is the same page, after the same time, whether or not
// the address has an account, so the forms tell nobody which addresses have one.
import { toBase64 } from './base64_bytes.ts';
import type { Email, Send } from './email.ts';
import { sha256Hex } from './hash.ts';
import { readForm } from './request.ts';
import { redirect, type SiteLocale, siteLocale, sitePage } from './site.ts';
import { type Client, logError } from './supabase.ts';

export type LinkRequestContext = {
  /** A client with the service role, which alone makes links. */
  admin: Client;
  send: Send;
  /** Lets work go on after the answer, as `EdgeRuntime.waitUntil` does. */
  inBackground: (work: Promise<unknown>) => void;
  siteUrl: string;
  /** The least time an answer takes, so that sending an email does not show in its timing. */
  minimumMs?: number;
  wait?: (ms: number) => Promise<void>;
};

/** What one kind of link needs. */
export type LinkRequest = {
  /** The site's page the form is sent on to, whatever it asked. */
  sentPage: string;
  /** What failed, for the log: "deletion of an account". */
  what: string;
  /** The link a form asks for, or none when the form names nothing a link is made for. */
  link: (form: URLSearchParams) => Link | undefined;
};

export type Link = {
  /** The site's page the link opens. */
  page: string;
  /**
   * Records the request and makes a link with the token's hash, answering with the address the
   * account has, or null when no link was made.
   */
  start: (
    admin: Client,
    args: { email: string; ipHash: string; tokenHash: string },
  ) => PromiseLike<{ data: string | null; error: unknown }>;
  email: (locale: SiteLocale, to: string, link: string) => Email;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A token nobody can guess: 32 random bytes, as base64url. */
export function newToken(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Whether a form's token looks like one newToken() makes. */
export const isLinkToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);

/**
 * The client's IP, from a header the platform sets: Cloudflare's, before it the gateway's, and
 * last the hop the proxy added at the end of `X-Forwarded-For`. The first entry there is the
 * client's own word, which would let it choose a new limit for every request.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  return (
    headers.get('cf-connecting-ip')?.trim() ||
    headers.get('x-real-ip')?.trim() ||
    forwarded ||
    'unknown'
  );
}

/** Takes a form asking for a link, made when the form holds an address and names a link. */
export async function requestLink(
  req: Request,
  { admin, send, inBackground, siteUrl, minimumMs = 1500, wait = sleep }: LinkRequestContext,
  { sentPage, what, link: linkOf }: LinkRequest,
): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  const started = Date.now();
  const form = await readForm(req);
  const locale = siteLocale(form.get('locale'));
  const email = (form.get('email') ?? '').trim();
  const kind = linkOf(form);

  if (kind && email.includes('@') && email.length <= 254) {
    try {
      const token = newToken();
      // The database decides what counts as the same address, and hashes it for the limits. It
      // answers with the address the account has, which the link goes to rather than the typed
      // one: the two can differ, as with a look-alike character the match folds (#530).
      const { data: stored, error } = await kind.start(admin, {
        email,
        ipHash: await sha256Hex(clientIp(req.headers)),
        tokenHash: await sha256Hex(token),
      });
      if (error) {
        logError(`Starting the ${what} failed`, error);
      } else if (stored) {
        // In the fragment, which browsers never send to a server, so no log holds the token.
        const link = `${sitePage(siteUrl, locale, kind.page)}#token=${token}`;
        // Sent after the answer: waiting for it would make only addresses with an account slow.
        inBackground(
          send(kind.email(locale, stored, link)).catch((cause) =>
            logError(`Sending the link for the ${what} failed`, cause),
          ),
        );
      }
    } catch (cause) {
      logError(`Starting the ${what} failed`, cause);
    }
  }

  await wait(Math.max(0, minimumMs - (Date.now() - started)));
  return redirect(sitePage(siteUrl, locale, sentPage));
}
