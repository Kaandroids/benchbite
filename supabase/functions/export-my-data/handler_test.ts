import { assertEquals } from '@std/assert';
import { unzipSync } from 'fflate';

import { EXPORT_JSON } from '../_shared/data_export_zip.ts';
import type { Client } from '../_shared/supabase.ts';
import { handleExport } from './handler.ts';

const A = '00000000-0000-0000-0000-00000000000a';
const NOW = () => new Date('2026-11-24T10:00:00Z');

/** The user's client, which answers export_my_data(), and the service role's storage. */
function context(answer: { data: unknown; error: { message: string } | null }) {
  const calls: string[] = [];
  const supabase = {
    rpc: (fn: string) => {
      calls.push(fn);
      return Promise.resolve(answer);
    },
  } as unknown as Client;
  const admin = {
    storage: {
      from: () => ({ download: () => Promise.resolve({ data: new Blob(['jpeg']), error: null }) }),
    },
  } as unknown as Client;
  return { calls, context: { supabase, admin, now: NOW } };
}

const post = () => new Request('http://localhost/export-my-data', { method: 'POST' });

Deno.test('answers with the user’s export as a ZIP no cache keeps, read as the user', async () => {
  const exported = {
    format: 'benchbite-export',
    media: [{ bucket: 'coach-media', path: `${A}/3/photo.jpg` }],
  };
  const { calls, context: ctx } = context({ data: exported, error: null });
  const response = await handleExport(post(), ctx);
  assertEquals(response.status, 200);
  assertEquals(response.headers.get('content-type'), 'application/zip');
  assertEquals(
    response.headers.get('content-disposition'),
    'attachment; filename="benchbite-data-2026-11-24.zip"',
  );
  assertEquals(response.headers.get('cache-control'), 'no-store');
  const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));
  assertEquals(Object.keys(entries).sort(), [EXPORT_JSON, 'media/coach-media/3/photo.jpg']);
  assertEquals(calls, ['export_my_data']);
});

Deno.test('says so when the export cannot be read, and takes only a POST', async () => {
  const down = context({ data: null, error: { message: 'down' } });
  assertEquals((await handleExport(post(), down.context)).status, 503);
  const { context: ctx } = context({ data: {}, error: null });
  const get = new Request('http://localhost/export-my-data');
  assertEquals((await handleExport(get, ctx)).status, 405);
});
