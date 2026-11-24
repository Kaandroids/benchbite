import { assertEquals } from '@std/assert';

import type { Client } from '../_shared/supabase.ts';
import { BATCH_SIZE, handlePurgeExports } from './handler.ts';

/** The service role's client: the stale ZIPs the database names, and what storage removes. */
function admin(stale: string[], { removeFails = false } = {}) {
  const removed: string[] = [];
  const asked: unknown[] = [];
  const client = {
    rpc: (fn: string, args: unknown) => {
      asked.push([fn, args]);
      return Promise.resolve({ data: stale, error: null });
    },
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => {
          if (removeFails) return Promise.resolve({ data: null, error: { message: 'down' } });
          removed.push(...paths.map((path) => `${bucket}:${path}`));
          return Promise.resolve({ data: paths.map((name) => ({ name })), error: null });
        },
      }),
    },
  } as unknown as Client;
  return { client, removed, asked };
}

const post = () => new Request('http://localhost/purge-data-exports', { method: 'POST' });

Deno.test('removes the ZIPs of more than a day, a batch at a time', async () => {
  const { client, removed, asked } = admin(['a/1.zip', 'b/2.zip']);
  const response = await handlePurgeExports(post(), client);
  assertEquals(await response.json(), { purged: 2 });
  assertEquals(removed, ['data-exports:a/1.zip', 'data-exports:b/2.zip']);
  assertEquals(asked, [['stale_data_exports', { p_limit: BATCH_SIZE }]]);
});

Deno.test('removes nothing when there is nothing to remove', async () => {
  const { client, removed } = admin([]);
  assertEquals(await (await handlePurgeExports(post(), client)).json(), { purged: 0 });
  assertEquals(removed, []);
});

Deno.test('says so when storage fails, so that the next run tries again', async () => {
  const { client } = admin(['a/1.zip'], { removeFails: true });
  assertEquals((await handlePurgeExports(post(), client)).status, 503);
});

Deno.test('removes one user’s export, as a withdrawal asks', async () => {
  const removed: string[] = [];
  const client = {
    storage: {
      from: (bucket: string) => ({
        list: () =>
          Promise.resolve({
            data: removed.length ? [] : [{ id: '1', name: '9.zip' }],
            error: null,
          }),
        remove: (paths: string[]) => {
          removed.push(...paths.map((path) => `${bucket}:${path}`));
          return Promise.resolve({ data: paths, error: null });
        },
      }),
    },
  } as unknown as Client;
  const user = '00000000-0000-0000-0000-00000000000a';
  const request = new Request('http://localhost/purge-data-exports', {
    method: 'POST',
    body: JSON.stringify({ userId: user }),
  });
  assertEquals(await (await handlePurgeExports(request, client)).json(), { purged: 'user' });
  assertEquals(removed, [`data-exports:${user}/9.zip`]);
});
