/**
 * Captcha tokens for the requests Supabase Auth guards with Cloudflare Turnstile (#455, ADR 0171):
 * signing up, as a guest too, signing in with a password, and sending a code. `CaptchaHost` runs
 * the widget; the requests ask it for a token here, one at a time, as each token is used once.
 */

/** Why no token came: the person closed the check, or Turnstile could not give one. */
export class CaptchaError extends Error {
  /**
   * Whether reportError() leaves it out: a check the person closed, or a page that could not load,
   * as offline. Any other failure is reported, as a check that never ends would go unseen.
   */
  readonly expected: boolean;

  constructor(
    readonly reason: 'cancelled' | 'failed',
    readonly detail?: string,
  ) {
    super(`No captcha token: ${reason}${detail ? ` (${detail})` : ''}`);
    this.expected = reason === 'cancelled' || detail === 'load';
  }
}

/** How a request asks for a token: whether the person may close the check, as on a form. */
export type TokenRequest = { cancellable: boolean };

type Host = (request: TokenRequest) => Promise<string>;

/** How long a request waits for the host to be there, as when the app has just started. */
const HOST_WAIT_MS = 10_000;

let host: Host | null = null;
let hostArrived: (() => void)[] = [];
let queue: Promise<unknown> = Promise.resolve();

/** Sets the component that gives the tokens, or none as it goes. */
export function setCaptchaHost(next: Host | null) {
  host = next;
  if (next) {
    hostArrived.forEach((arrived) => arrived());
    hostArrived = [];
  }
}

function waitForHost(): Promise<Host> {
  if (host) return Promise.resolve(host);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new CaptchaError('failed', 'no host')), HOST_WAIT_MS);
    hostArrived.push(() => {
      clearTimeout(timer);
      resolve(host!);
    });
  });
}

/**
 * A new captcha token for one request to Supabase Auth. A first launch asks with `cancellable`
 * false, as the app cannot go on without a session.
 */
export function captchaToken(request: TokenRequest = { cancellable: true }): Promise<string> {
  const next = queue.then(async () => (await waitForHost())(request));
  // The next request waits for this one, whatever its outcome.
  queue = next.catch(() => {});
  return next;
}
