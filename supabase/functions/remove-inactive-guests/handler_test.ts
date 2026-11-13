import { assertEquals } from '@std/assert';

import { EXERCISE_PHOTOS_BUCKET } from '../_shared/exercise_photos.ts';
import type { Client } from '../_shared/supabase.ts';
import { BATCH_SIZE, handleRemovalRequest } from './handler.ts';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';

type Options = { guests?: string[]; rpcError?: boolean; failing?: string[] };

/**
 * A stand-in for the service role client: inactive_guests() answering with `guests`, an empty
 * bucket and auth's deleting, which fails for the `failing` guests.
 */
function fakeAdmin({ guests = [A, B], rpcError = false, failing = [] }: Options = {}) {
  const calls: { name: string; args: unknown }[] = [];
  const deleted: string[] = [];
  const admin = {
    rpc: (name: string, args: unknown) => {
      calls.push({ name, args });
      return Promise.resolve(
        rpcError ? { data: null, error: { message: 'down' } } : { data: guests, error: null },
      );
    },
    storage: {
      from: (bucket: string) => {
        if (bucket !== EXERCISE_PHOTOS_BUCKET) throw new Error(`Unexpected bucket ${bucket}`);
        return {
          list: () => Promise.resolve({ data: [], error: null }),
          remove: () => Promise.resolve({ data: [], error: null }),
        };
      },
    },
    auth: {
      admin: {
        deleteUser: (id: string) => {
          if (failing.includes(id)) {
            return Promise.resolve({ data: null, error: { status: 500 } });
          }
          deleted.push(id);
          return Promise.resolve({ data: {}, error: null });
        },
      },
    },
  } as unknown as Client;
  return { admin, calls, deleted };
}

const post = () => new Request('http://localhost/remove-inactive-guests', { method: 'POST' });

Deno.test('deletes a batch of inactive guests', async () => {
  const { admin, calls, deleted } = fakeAdmin();
  const response = await handleRemovalRequest(post(), { admin });
  assertEquals(calls, [{ name: 'inactive_guests', args: { p_limit: BATCH_SIZE } }]);
  assertEquals(deleted, [A, B]);
  assertEquals(await response.json(), { removed: 2, failed: 0 });
});

Deno.test('goes on after a guest it could not delete, and counts it', async () => {
  const { admin, deleted } = fakeAdmin({ failing: [A] });
  const response = await handleRemovalRequest(post(), { admin });
  assertEquals(deleted, [B]);
  assertEquals(await response.json(), { removed: 1, failed: 1 });
});

Deno.test('answers 503 when the guests cannot be found', async () => {
  const { admin, deleted } = fakeAdmin({ rpcError: true });
  const response = await handleRemovalRequest(post(), { admin });
  assertEquals(response.status, 503);
  assertEquals(deleted, []);
});

Deno.test('refuses other methods', async () => {
  const { admin, calls } = fakeAdmin();
  const response = await handleRemovalRequest(
    new Request('http://localhost/remove-inactive-guests'),
    { admin },
  );
  assertEquals(response.status, 405);
  assertEquals(calls, []);
});
