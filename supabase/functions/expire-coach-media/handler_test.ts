import { assertEquals } from '@std/assert';

import type { Client } from '../_shared/supabase.ts';
import { BATCH_SIZE, handleExpireMedia } from './handler.ts';

const A = '00000000-0000-0000-0000-00000000000a';

/** The service role's client: the expiring media, storage's removal, and the marking. */
function admin(
  expiring: { message_id: number; path: string }[],
  { removeFails = false, forgetFails = false } = {},
) {
  const calls: string[] = [];
  const client = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push(`${fn} ${JSON.stringify(args)}`);
      if (fn === 'expiring_coach_media') return Promise.resolve({ data: expiring, error: null });
      return Promise.resolve({ data: null, error: forgetFails ? { message: 'down' } : null });
    },
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => {
          calls.push(`remove ${bucket} ${paths.join(',')}`);
          return Promise.resolve(
            removeFails ? { data: null, error: { message: 'down' } } : { data: paths, error: null },
          );
        },
      }),
    },
  } as unknown as Client;
  return { client, calls };
}

const post = () => new Request('http://localhost/expire-coach-media', { method: 'POST' });

Deno.test('removes the files, then marks each message’s media removed', async () => {
  const { client, calls } = admin([
    { message_id: 7, path: `${A}/5/a.jpg` },
    { message_id: 7, path: `${A}/5/b.m4a` },
    { message_id: 9, path: `${A}/6/c.jpg` },
  ]);
  const response = await handleExpireMedia(post(), client);
  assertEquals(await response.json(), { expired: 3 });
  assertEquals(calls, [
    `expiring_coach_media {"p_limit":${BATCH_SIZE}}`,
    `remove coach-media ${A}/5/a.jpg,${A}/5/b.m4a,${A}/6/c.jpg`,
    'forget_coach_media {"p_message_ids":[7,9]}',
  ]);
});

Deno.test('does nothing when nothing is past its time', async () => {
  const { client, calls } = admin([]);
  assertEquals(await (await handleExpireMedia(post(), client)).json(), { expired: 0 });
  assertEquals(calls.length, 1);
});

Deno.test('marks nothing when storage fails, so that the next run tries again', async () => {
  const { client, calls } = admin([{ message_id: 7, path: `${A}/5/a.jpg` }], { removeFails: true });
  assertEquals((await handleExpireMedia(post(), client)).status, 503);
  assertEquals(
    calls.some((call) => call.startsWith('forget_coach_media')),
    false,
  );
});

Deno.test('says so when the marking fails', async () => {
  const { client } = admin([{ message_id: 7, path: `${A}/5/a.jpg` }], { forgetFails: true });
  assertEquals((await handleExpireMedia(post(), client)).status, 503);
});
