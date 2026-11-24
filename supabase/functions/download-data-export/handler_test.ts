import { assertEquals } from '@std/assert';
import { strFromU8, unzipSync } from 'fflate';

import { EXPORT_JSON } from '../_shared/data_export_zip.ts';
import { fakeExportAdmin } from '../_shared/fake_export_storage.ts';

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

const A = '00000000-0000-0000-0000-00000000000a';

/** The service role's client of a stored export: the link's answer, the limit and storage. */
function storingAdmin(exported: unknown, taken = true) {
  const store = fakeExportAdmin({ taken });
  const calls: string[] = [];
  const client = store.client as unknown as { rpc: unknown };
  client.rpc = (fn: string, args: Record<string, string>) => {
    calls.push(
      fn === 'export_data_by_link'
        ? `${fn} ${args.p_token_hash!.includes(TOKEN) ? 'token' : 'hash'}`
        : `${fn} ${args.p_user}`,
    );
    return Promise.resolve(
      fn === 'export_data_by_link' ? { data: exported, error: null } : { data: taken, error: null },
    );
  };
  return { ...store, calls };
}

Deno.test(
  'sends the browser to the account’s ZIP in storage, asking with the token’s hash',
  async () => {
    const exported = { format: 'benchbite-export', account: { id: A }, media: [] };
    const admin = storingAdmin(exported);
    const response = await handleExportDownload(post({ token: TOKEN }), {
      admin: admin.client,
      siteUrl: SITE,
      now: NOW,
    });
    const path = `${A}/${NOW().getTime()}.zip`;
    assertEquals(response.status, 303);
    assertEquals(
      response.headers.get('location'),
      `https://storage.test/data-exports/${path}?token=t`,
    );
    assertEquals(admin.calls, ['export_data_by_link hash', `take_data_export ${A}`]);
    assertEquals(admin.signed[0]!.download, 'benchbite-data-2026-11-18.zip');
    const entries = unzipSync(admin.uploaded[path]!);
    assertEquals(JSON.parse(strFromU8(entries[EXPORT_JSON]!)).account, { id: A });
  },
);

Deno.test('says the account used its two exports of the hour', async () => {
  const admin = storingAdmin({ account: { id: A }, media: [] }, false);
  const response = await handleExportDownload(post({ token: TOKEN }), {
    admin: admin.client,
    siteUrl: SITE,
  });
  assertEquals(
    response.headers.get('location'),
    `${SITE}/export-data/download#token=${TOKEN}&limit`,
  );
  assertEquals(Object.keys(admin.uploaded), []);
});

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
