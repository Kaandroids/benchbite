import { assertEquals } from '@std/assert';
import { unzipSync } from 'fflate';

import { EXPORT_JSON, LINK_SECONDS } from '../_shared/data_export_zip.ts';
import { fakeExportAdmin } from '../_shared/fake_export_storage.ts';
import type { Client } from '../_shared/supabase.ts';
import { handleExport } from './handler.ts';

const A = '00000000-0000-0000-0000-00000000000a';
const NOW = () => new Date('2026-11-24T10:00:00Z');

/** The user's client, which answers export_my_data(). */
function userClient(answer: { data: unknown; error: { message: string } | null }) {
  return { rpc: () => Promise.resolve(answer) } as unknown as Client;
}

const exported = {
  format: 'benchbite-export',
  media: [{ bucket: 'coach-media', path: `${A}/3/photo.jpg` }],
};
const post = () => new Request('http://localhost/export-my-data', { method: 'POST' });

Deno.test('stores the user’s ZIP in place of the last, and answers with a link to it', async () => {
  const admin = fakeExportAdmin({ media: { [`coach-media:${A}/3/photo.jpg`]: 'jpeg' } });
  admin.uploaded[`${A}/1.zip`] = new Uint8Array([1]);
  const response = await handleExport(post(), {
    supabase: userClient({ data: exported, error: null }),
    admin: admin.client,
    userId: A,
    now: NOW,
  });
  assertEquals(response.status, 200);
  const path = `${A}/${NOW().getTime()}.zip`;
  assertEquals(await response.json(), { url: `https://storage.test/data-exports/${path}?token=t` });
  assertEquals(admin.calls, [`take_data_export ${A}`]);
  assertEquals(admin.removed, [`${A}/1.zip`]);
  assertEquals(admin.signed, [
    { path, seconds: LINK_SECONDS, download: 'benchbite-data-2026-11-24.zip' },
  ]);
  const entries = unzipSync(admin.uploaded[path]!);
  assertEquals(Object.keys(entries).sort(), [EXPORT_JSON, 'media/coach-media/3/photo.jpg']);
});

Deno.test('refuses a third export in the hour, before reading anything', async () => {
  const admin = fakeExportAdmin({ taken: false });
  const response = await handleExport(post(), {
    supabase: userClient({ data: exported, error: null }),
    admin: admin.client,
    userId: A,
  });
  assertEquals(response.status, 429);
  assertEquals(await response.json(), { error: 'too_many_exports' });
  assertEquals(Object.keys(admin.uploaded), []);
});

Deno.test('says so when the export cannot be read or stored, and takes only a POST', async () => {
  const down = await handleExport(post(), {
    supabase: userClient({ data: null, error: { message: 'down' } }),
    admin: fakeExportAdmin().client,
    userId: A,
  });
  assertEquals(down.status, 503);
  const full = await handleExport(post(), {
    supabase: userClient({ data: exported, error: null }),
    admin: fakeExportAdmin({ uploadFails: true }).client,
    userId: A,
  });
  assertEquals(full.status, 503);
  const get = await handleExport(new Request('http://localhost/export-my-data'), {
    supabase: userClient({ data: {}, error: null }),
    admin: fakeExportAdmin().client,
    userId: A,
  });
  assertEquals(get.status, 405);
});
