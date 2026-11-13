import { assertEquals } from '@std/assert';

import { EXERCISE_PHOTOS_BUCKET } from '../_shared/exercise_photos.ts';
import type { Client } from '../_shared/supabase.ts';
import { BATCH_SIZE, handleRemovalRequest, TIME_BUDGET_MS } from './handler.ts';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';

/** A full batch of distinct guests, the first named by `prefix`. */
const fullBatch = (prefix: string) =>
  Array.from({ length: BATCH_SIZE }, (_, i) => `${prefix}-${i.toString().padStart(2, '0')}`);

type Options = {
  batches?: (string[] | 'error')[];
  failing?: string[];
  returned?: string[];
  checkError?: boolean;
};

/**
 * A stand-in for the service role client: inactive_guests() answering with each of `batches` in
 * turn and then with none ('error' fails that call), guest_still_inactive() saying the `returned`
 * guests came back (or failing with `checkError`), an empty bucket and auth's deleting, which
 * fails for the `failing` guests.
 */
function fakeAdmin({
  batches = [[A, B]],
  failing = [],
  returned = [],
  checkError = false,
}: Options = {}) {
  const calls: { name: string; args: unknown }[] = [];
  const checked: string[] = [];
  const attempts: string[] = [];
  const deleted: string[] = [];
  const admin = {
    rpc: (name: string, args: { p_limit?: number; p_user?: string }) => {
      if (name === 'guest_still_inactive') {
        checked.push(args.p_user!);
        return Promise.resolve(
          checkError
            ? { data: null, error: { message: 'down' } }
            : { data: !returned.includes(args.p_user!), error: null },
        );
      }
      if (name !== 'inactive_guests') throw new Error(`Unexpected function ${name}`);
      const batch = batches[calls.length] ?? [];
      calls.push({ name, args });
      return Promise.resolve(
        batch === 'error'
          ? { data: null, error: { message: 'down' } }
          : { data: batch, error: null },
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
          attempts.push(id);
          if (failing.includes(id)) {
            return Promise.resolve({ data: null, error: { status: 500 } });
          }
          deleted.push(id);
          return Promise.resolve({ data: {}, error: null });
        },
      },
    },
  } as unknown as Client;
  return { admin, calls, checked, attempts, deleted };
}

const post = () => new Request('http://localhost/remove-inactive-guests', { method: 'POST' });

Deno.test('deletes the inactive guests', async () => {
  const { admin, calls, deleted } = fakeAdmin();
  const response = await handleRemovalRequest(post(), { admin });
  assertEquals(calls, [{ name: 'inactive_guests', args: { p_limit: BATCH_SIZE } }]);
  assertEquals(deleted, [A, B]);
  assertEquals(await response.json(), { removed: 2, failed: 0 });
});

Deno.test('takes batches until none are left', async () => {
  const [first, second] = [fullBatch('a'), fullBatch('b')];
  const { admin, calls, deleted } = fakeAdmin({ batches: [first, second] });
  const response = await handleRemovalRequest(post(), { admin });
  assertEquals(calls.length, 3);
  assertEquals(deleted, [...first, ...second]);
  assertEquals(await response.json(), { removed: 2 * BATCH_SIZE, failed: 0 });
});

Deno.test('starts no batch once its time is up', async () => {
  const { admin, calls } = fakeAdmin({ batches: [fullBatch('a'), fullBatch('b')] });
  let time = 0;
  // Each look at the clock is 40% of the budget later, so that two batches start, not three.
  const now = () => (time += TIME_BUDGET_MS * 0.4);
  const response = await handleRemovalRequest(post(), { admin, now });
  assertEquals(calls.length, 2);
  assertEquals(await response.json(), { removed: 2 * BATCH_SIZE, failed: 0 });
});

Deno.test('goes on after a guest it could not delete, and counts it', async () => {
  const { admin, deleted } = fakeAdmin({ failing: [A] });
  const response = await handleRemovalRequest(post(), { admin });
  assertEquals(deleted, [B]);
  assertEquals(await response.json(), { removed: 1, failed: 1 });
});

Deno.test('tries a guest that fails only once in a run', async () => {
  const [first, second] = [fullBatch('a'), fullBatch('b')];
  // The second batch picks the failing guest again.
  const { admin, attempts } = fakeAdmin({
    batches: [first, [first[0], ...second.slice(1)]],
    failing: [first[0]],
  });
  const response = await handleRemovalRequest(post(), { admin });
  assertEquals(attempts.filter((id) => id === first[0]).length, 1);
  assertEquals(await response.json(), { removed: 2 * BATCH_SIZE - 2, failed: 1 });
});

Deno.test('leaves a guest who came back since they were found', async () => {
  const { admin, checked, deleted } = fakeAdmin({ returned: [A] });
  const response = await handleRemovalRequest(post(), { admin });
  assertEquals(checked, [A, B]);
  assertEquals(deleted, [B]);
  assertEquals(await response.json(), { removed: 1, failed: 0 });
});

Deno.test('deletes no guest it could not check again', async () => {
  const { admin, deleted } = fakeAdmin({ checkError: true });
  const response = await handleRemovalRequest(post(), { admin });
  assertEquals(deleted, []);
  assertEquals(await response.json(), { removed: 0, failed: 2 });
});

Deno.test('stops at a full batch of guests that all fail', async () => {
  const stuck = fullBatch('a');
  const { admin, calls } = fakeAdmin({ batches: [stuck, stuck], failing: stuck });
  const response = await handleRemovalRequest(post(), { admin });
  assertEquals(calls.length, 1);
  assertEquals(await response.json(), { removed: 0, failed: BATCH_SIZE });
});

Deno.test('answers 503 when the guests cannot be found', async () => {
  const { admin, deleted } = fakeAdmin({ batches: ['error'] });
  const response = await handleRemovalRequest(post(), { admin });
  assertEquals(response.status, 503);
  assertEquals(deleted, []);
});

Deno.test('keeps what it removed when a later batch cannot be found', async () => {
  const { admin } = fakeAdmin({ batches: [fullBatch('a'), 'error'] });
  const response = await handleRemovalRequest(post(), { admin });
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { removed: BATCH_SIZE, failed: 0 });
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
