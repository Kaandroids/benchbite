import { assertEquals } from '@std/assert';

import type { Client } from '../_shared/supabase.ts';
import { handleWithdrawalConfirm } from './handler.ts';

const SITE = 'https://www.benchbite.com';
const TOKEN = 'a'.repeat(43);

/** A stand-in for the service role client: withdraw_consent_by_link()'s answer, and the calls. */
function fakeAdmin(answer: { data: boolean | null; error: { message: string } | null }) {
  const calls: { fn: string; args: Record<string, string> }[] = [];
  const admin = {
    rpc: (fn: string, args: Record<string, string>) => {
      calls.push({ fn, args });
      return Promise.resolve(answer);
    },
  } as unknown as Client;
  return { admin, calls };
}

const post = (fields: Record<string, string>) =>
  new Request('http://localhost/confirm-consent-withdrawal', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });

Deno.test('withdraws the consent of the link, with only the token’s hash', async () => {
  const { admin, calls } = fakeAdmin({ data: true, error: null });
  const response = await handleWithdrawalConfirm(
    post({ token: TOKEN, consent: 'ai', locale: 'de' }),
    { admin, siteUrl: SITE },
  );
  assertEquals(response.status, 303);
  assertEquals(response.headers.get('location'), `${SITE}/de/withdraw-consent/done`);
  assertEquals(calls[0]!.fn, 'withdraw_consent_by_link');
  assertEquals(calls[0]!.args.p_consent, 'ai');
  assertEquals(calls[0]!.args.p_token_hash!.includes(TOKEN), false);
});

Deno.test('says a link that does not work has run out', async () => {
  const { admin } = fakeAdmin({ data: false, error: null });
  const response = await handleWithdrawalConfirm(post({ token: TOKEN, consent: 'health' }), {
    admin,
    siteUrl: SITE,
  });
  assertEquals(response.headers.get('location'), `${SITE}/withdraw-consent/expired`);
});

Deno.test('asks nothing for a token or consent no link has', async () => {
  const { admin, calls } = fakeAdmin({ data: true, error: null });
  for (const fields of [
    { token: 'short', consent: 'ai' },
    { token: TOKEN, consent: 'terms' },
  ]) {
    const response = await handleWithdrawalConfirm(post(fields), { admin, siteUrl: SITE });
    assertEquals(response.headers.get('location'), `${SITE}/withdraw-consent/expired`);
  }
  assertEquals(calls.length, 0);
});

Deno.test('goes back to the page with its token when the withdrawal fails', async () => {
  const { admin } = fakeAdmin({ data: null, error: { message: 'down' } });
  const response = await handleWithdrawalConfirm(
    post({ token: TOKEN, consent: 'health', locale: 'tr' }),
    { admin, siteUrl: SITE },
  );
  assertEquals(
    response.headers.get('location'),
    `${SITE}/tr/withdraw-consent/health#token=${TOKEN}&failed`,
  );
});

Deno.test('refuses anything but a form posted', async () => {
  const { admin } = fakeAdmin({ data: true, error: null });
  const response = await handleWithdrawalConfirm(new Request('http://localhost/'), {
    admin,
    siteUrl: SITE,
  });
  assertEquals(response.status, 405);
});
