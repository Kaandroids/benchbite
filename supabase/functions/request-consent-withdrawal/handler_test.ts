import { assert, assertEquals } from '@std/assert';

import type { Email } from '../_shared/email.ts';
import type { Client } from '../_shared/supabase.ts';
import { handleWithdrawalRequest } from './handler.ts';

const SITE = 'https://www.benchbite.com';

/** The address the account has, as start_consent_withdrawal() answers it, with the calls made. */
function context(stored: string | null) {
  const sent: Email[] = [];
  const calls: { fn: string; args: Record<string, string> }[] = [];
  const admin = {
    rpc: (fn: string, args: Record<string, string>) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: stored, error: null });
    },
  } as unknown as Client;
  return {
    sent,
    calls,
    ctx: {
      admin,
      siteUrl: SITE,
      inBackground: () => {},
      send: (email: Email) => {
        sent.push(email);
        return Promise.resolve();
      },
      wait: () => Promise.resolve(),
    },
  };
}

const post = (fields: Record<string, string>) =>
  new Request('http://localhost/request-consent-withdrawal', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });

Deno.test('sends a link to the page of the consent chosen, in the page’s language', async () => {
  const { ctx, sent, calls } = context('kaan@example.com');
  const response = await handleWithdrawalRequest(
    post({ email: 'Kaan@Example.com', consent: 'health', locale: 'tr' }),
    ctx,
  );
  assertEquals(response.headers.get('location'), `${SITE}/tr/withdraw-consent/sent`);
  assertEquals(calls[0]!.fn, 'start_consent_withdrawal');
  assertEquals(calls[0]!.args.p_consent, 'health');
  assertEquals(sent.length, 1);
  assertEquals(sent[0]!.to, 'kaan@example.com');
  assert(sent[0]!.text.includes('sağlık verisi'));
  const link = sent[0]!.text.match(/https:\S+/)![0];
  const [page, token] = link.split('#token=');
  assertEquals(page, `${SITE}/tr/withdraw-consent/health`);
  assert(/^[A-Za-z0-9_-]{43}$/.test(token!));
});

Deno.test('names the AI features for their consent', async () => {
  const { ctx, sent } = context('kaan@example.com');
  await handleWithdrawalRequest(post({ email: 'kaan@example.com', consent: 'ai' }), ctx);
  assert(sent[0]!.text.includes('the AI features'));
  assert(sent[0]!.text.includes(`${SITE}/withdraw-consent/ai#token=`));
});

Deno.test('answers the same, asking nothing, for a consent the site does not offer', async () => {
  const { ctx, sent, calls } = context('kaan@example.com');
  const response = await handleWithdrawalRequest(
    post({ email: 'kaan@example.com', consent: 'terms' }),
    ctx,
  );
  assertEquals(response.headers.get('location'), `${SITE}/withdraw-consent/sent`);
  assertEquals(calls.length, 0);
  assertEquals(sent.length, 0);
});

Deno.test('answers the same, sending nothing, for an address without a link', async () => {
  const { ctx, sent } = context(null);
  const response = await handleWithdrawalRequest(
    post({ email: 'nobody@example.com', consent: 'ai' }),
    ctx,
  );
  assertEquals(response.headers.get('location'), `${SITE}/withdraw-consent/sent`);
  assertEquals(sent.length, 0);
});
