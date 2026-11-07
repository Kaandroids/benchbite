import { assert, assertEquals } from '@std/assert';

import type { Email } from '../_shared/email.ts';
import type { Client } from '../_shared/supabase.ts';
import { clientIp, handleDeletionRequest } from './handler.ts';

const SITE = 'https://www.benchbite.com';

/** A stand-in for the service role client: the one call, its arguments and its answer. */
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

function post(fields: Record<string, string>, ip = '203.0.113.7') {
  return new Request('http://localhost/request-account-deletion', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-forwarded-for': `${ip}, 10.0.0.1`,
    },
    body: new URLSearchParams(fields),
  });
}

function context(made: boolean | null, error: { message: string } | null = null) {
  const sent: Email[] = [];
  const waits: number[] = [];
  const background: Promise<unknown>[] = [];
  const { admin, calls } = fakeAdmin({ data: made, error });
  return {
    sent,
    waits,
    calls,
    background,
    ctx: {
      admin,
      siteUrl: SITE,
      inBackground: (work: Promise<unknown>) => {
        background.push(work);
      },
      send: (email: Email) => {
        sent.push(email);
        return Promise.resolve();
      },
      wait: (ms: number) => {
        waits.push(ms);
        return Promise.resolve();
      },
    },
  };
}

Deno.test(
  'sends a link to an account, in the page’s language, with the token in the fragment',
  async () => {
    const { ctx, sent, calls } = context(true);
    const response = await handleDeletionRequest(
      post({ email: ' Kaan@Example.com ', locale: 'de' }),
      ctx,
    );
    assertEquals(response.status, 303);
    assertEquals(response.headers.get('location'), `${SITE}/de/delete-account/sent`);
    assertEquals(calls.length, 1);
    assertEquals(calls[0]!.fn, 'start_account_deletion');
    assertEquals(calls[0]!.args.p_email, 'Kaan@Example.com');
    assert(calls[0]!.args.p_ip_hash!.startsWith('\\x'));
    assertEquals(sent.length, 1);
    assertEquals(sent[0]!.to, 'Kaan@Example.com');
    assertEquals(sent[0]!.subject, 'Lösche dein Benchbite-Konto');
    const link = sent[0]!.text.match(/https:\S+/)![0];
    const [page, token] = link.split('#token=');
    assertEquals(page, `${SITE}/de/delete-account/confirm`);
    assert(/^[A-Za-z0-9_-]{43}$/.test(token!));
    // Only the hash of the token reaches the database.
    assert(!calls[0]!.args.p_token_hash!.includes(token!));
  },
);

Deno.test(
  'answers without waiting for the email, which could make only accounts slow',
  async () => {
    const { ctx, background } = context(true);
    const response = await handleDeletionRequest(post({ email: 'kaan@example.com' }), {
      ...ctx,
      send: () => new Promise(() => {}),
    });
    assertEquals(response.headers.get('location'), `${SITE}/delete-account/sent`);
    assertEquals(background.length, 1);
  },
);

Deno.test('limits by an IP the platform sets, never by the first X-Forwarded-For entry', () => {
  assertEquals(
    clientIp(
      new Headers({ 'cf-connecting-ip': '198.51.100.1', 'x-forwarded-for': 'chosen, 10.0.0.1' }),
    ),
    '198.51.100.1',
  );
  assertEquals(
    clientIp(new Headers({ 'x-real-ip': '198.51.100.2', 'x-forwarded-for': 'chosen' })),
    '198.51.100.2',
  );
  assertEquals(
    clientIp(new Headers({ 'x-forwarded-for': 'chosen, 198.51.100.3' })),
    '198.51.100.3',
  );
  assertEquals(clientIp(new Headers()), 'unknown');
});

Deno.test('answers the same, sending nothing, for an address without a link', async () => {
  const { ctx, sent } = context(false);
  const response = await handleDeletionRequest(post({ email: 'nobody@example.com' }), ctx);
  assertEquals(response.headers.get('location'), `${SITE}/delete-account/sent`);
  assertEquals(sent.length, 0);
});

Deno.test('takes the same time either way, by waiting out what is left of it', async () => {
  const { ctx, waits } = context(false);
  await handleDeletionRequest(post({ email: 'nobody@example.com' }), { ...ctx, minimumMs: 1500 });
  assertEquals(waits.length, 1);
  assert(waits[0]! > 1000 && waits[0]! <= 1500);
});

Deno.test('answers the same when the database or the email fails', async () => {
  const failing = context(null, { message: 'down' });
  const one = await handleDeletionRequest(post({ email: 'kaan@example.com' }), failing.ctx);
  assertEquals(one.headers.get('location'), `${SITE}/delete-account/sent`);

  const { ctx, background } = context(true);
  const two = await handleDeletionRequest(post({ email: 'kaan@example.com' }), {
    ...ctx,
    send: () => Promise.reject(new Error('Sending an email failed with 500')),
  });
  assertEquals(two.headers.get('location'), `${SITE}/delete-account/sent`);
  // The failure is logged, not thrown, after the answer.
  await Promise.all(background);
});

Deno.test(
  'asks the database nothing for what is no address, and falls back to English',
  async () => {
    const { ctx, calls } = context(true);
    const response = await handleDeletionRequest(
      post({ email: 'not an address', locale: 'xx' }),
      ctx,
    );
    assertEquals(calls.length, 0);
    assertEquals(response.headers.get('location'), `${SITE}/delete-account/sent`);
  },
);

Deno.test('refuses anything but a form posted', async () => {
  const { ctx } = context(true);
  const response = await handleDeletionRequest(new Request('http://localhost/'), ctx);
  assertEquals(response.status, 405);
});
