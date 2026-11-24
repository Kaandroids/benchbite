import { assertEquals } from '@std/assert';
import { strFromU8, unzipSync } from 'fflate';

import { EXPORT_JSON } from '../_shared/data_export_zip.ts';

import type { Client } from '../_shared/supabase.ts';
import { handleExportDownload } from './handler.ts';

const SITE = 'https://www.benchbite.com';
const TOKEN = 'a'.repeat(43);
const NOW = () => new Date('2026-11-18T10:00:00Z');

/** A stand-in for the service role client: export_data_by_link()'s answer, and the calls. */
function fakeAdmin(answer: { data: unknown; error: { message: string } | null }) {
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
  new Request('http://localhost/download-data-export', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });

Deno.test(
  'answers with the export as a ZIP no cache keeps, asking with the token’s hash',
  async () => {
    const { admin, calls } = fakeAdmin({ data: { format: 'benchbite-export' }, error: null });
    const response = await handleExportDownload(post({ token: TOKEN }), {
      admin,
      siteUrl: SITE,
      now: NOW,
    });
    assertEquals(response.status, 200);
    assertEquals(
      response.headers.get('content-disposition'),
      'attachment; filename="benchbite-data-2026-11-18.zip"',
    );
    assertEquals(response.headers.get('content-type'), 'application/zip');
    assertEquals(response.headers.get('cache-control'), 'no-store');
    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));
    assertEquals(JSON.parse(strFromU8(entries[EXPORT_JSON]!)), {
      format: 'benchbite-export',
      media: [],
    });
    assertEquals(calls[0]!.fn, 'export_data_by_link');
    assertEquals(calls[0]!.args.p_token_hash!.includes(TOKEN), false);
  },
);

Deno.test('says a link that does not work has run out', async () => {
  const { admin } = fakeAdmin({ data: null, error: null });
  const response = await handleExportDownload(post({ token: TOKEN, locale: 'tr' }), {
    admin,
    siteUrl: SITE,
  });
  assertEquals(response.headers.get('location'), `${SITE}/tr/export-data/expired`);
});

Deno.test('asks nothing for a token no link has', async () => {
  const { admin, calls } = fakeAdmin({ data: {}, error: null });
  const response = await handleExportDownload(post({ token: 'short' }), { admin, siteUrl: SITE });
  assertEquals(response.headers.get('location'), `${SITE}/export-data/expired`);
  assertEquals(calls.length, 0);
});

Deno.test('goes back to the page with its token when the export fails', async () => {
  const { admin } = fakeAdmin({ data: null, error: { message: 'down' } });
  const response = await handleExportDownload(post({ token: TOKEN }), { admin, siteUrl: SITE });
  assertEquals(
    response.headers.get('location'),
    `${SITE}/export-data/download#token=${TOKEN}&failed`,
  );
});

Deno.test('refuses anything but a form posted', async () => {
  const { admin } = fakeAdmin({ data: {}, error: null });
  const response = await handleExportDownload(new Request('http://localhost/'), {
    admin,
    siteUrl: SITE,
  });
  assertEquals(response.status, 405);
});
