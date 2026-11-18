import { assert, assertEquals } from '@std/assert';

import type { Email } from '../_shared/email.ts';
import type { Client } from '../_shared/supabase.ts';
import { handleExportRequest } from './handler.ts';

const SITE = 'https://www.benchbite.com';

/** The address the account has, as start_data_export() answers it, with the calls made. */
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
  new Request('http://localhost/request-data-export', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });

Deno.test('sends a link to the download page, in the page’s language', async () => {
  const { ctx, sent, calls } = context('kaan@example.com');
  const response = await handleExportRequest(
    post({ email: 'Kaan@Example.com', locale: 'de' }),
    ctx,
  );
  assertEquals(response.headers.get('location'), `${SITE}/de/export-data/sent`);
  assertEquals(calls[0]!.fn, 'start_data_export');
  assertEquals(sent[0]!.to, 'kaan@example.com');
  assertEquals(sent[0]!.subject, 'Deine Benchbite-Daten');
  const link = sent[0]!.text.match(/https:\S+/)![0];
  const [page, token] = link.split('#token=');
  assertEquals(page, `${SITE}/de/export-data/download`);
  assert(/^[A-Za-z0-9_-]{43}$/.test(token!));
});

Deno.test('answers the same, sending nothing, for an address without a link', async () => {
  const { ctx, sent } = context(null);
  const response = await handleExportRequest(post({ email: 'nobody@example.com' }), ctx);
  assertEquals(response.headers.get('location'), `${SITE}/export-data/sent`);
  assertEquals(sent.length, 0);
});
