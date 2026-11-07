import { assertEquals } from '@std/assert';

import { EXERCISE_PHOTOS_BUCKET } from '../_shared/exercise_photos.ts';
import type { Client } from '../_shared/supabase.ts';
import { handleDeletionConfirm } from './handler.ts';

const SITE = 'https://www.benchbite.com';
const TOKEN = 'a'.repeat(43);
const A = '00000000-0000-0000-0000-00000000000a';

type Options = {
  user?: string | null;
  rpcError?: boolean;
  deleteError?: { status: number } | null;
};

/** A stand-in for the service role client: the link's user, an empty bucket and auth's deleting. */
function fakeAdmin({ user = A, rpcError = false, deleteError = null }: Options = {}) {
  const deleted: string[] = [];
  const admin = {
    rpc: () =>
      Promise.resolve(
        rpcError ? { data: null, error: { message: 'down' } } : { data: user, error: null },
      ),
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
          deleted.push(id);
          return Promise.resolve({ data: {}, error: deleteError });
        },
      },
    },
  } as unknown as Client;
  return { admin, deleted };
}

const post = (fields: Record<string, string>) =>
  new Request('http://localhost/confirm-account-deletion', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });

Deno.test('deletes the link’s account and says so, in the page’s language', async () => {
  const { admin, deleted } = fakeAdmin();
  const response = await handleDeletionConfirm(post({ token: TOKEN, locale: 'tr' }), {
    admin,
    siteUrl: SITE,
  });
  assertEquals(deleted, [A]);
  assertEquals(response.status, 303);
  assertEquals(response.headers.get('location'), `${SITE}/tr/delete-account/done`);
});

Deno.test('deletes nobody for a link that no longer works', async () => {
  const { admin, deleted } = fakeAdmin({ user: null });
  const response = await handleDeletionConfirm(post({ token: TOKEN }), { admin, siteUrl: SITE });
  assertEquals(deleted, []);
  assertEquals(response.headers.get('location'), `${SITE}/delete-account/expired`);
});

Deno.test('asks nothing for what is no token', async () => {
  const { admin, deleted } = fakeAdmin();
  const response = await handleDeletionConfirm(post({ token: 'short' }), { admin, siteUrl: SITE });
  assertEquals(deleted, []);
  assertEquals(response.headers.get('location'), `${SITE}/delete-account/expired`);
});

Deno.test('sends back to the page, to try again, when deleting fails', async () => {
  const { admin } = fakeAdmin({ deleteError: { status: 500 } });
  const response = await handleDeletionConfirm(post({ token: TOKEN }), { admin, siteUrl: SITE });
  assertEquals(response.headers.get('location'), `${SITE}/delete-account/confirm#failed`);

  const down = fakeAdmin({ rpcError: true });
  const again = await handleDeletionConfirm(post({ token: TOKEN }), {
    admin: down.admin,
    siteUrl: SITE,
  });
  assertEquals(again.headers.get('location'), `${SITE}/delete-account/confirm#failed`);
  assertEquals(down.deleted, []);
});

Deno.test('refuses anything but a form posted', async () => {
  const { admin } = fakeAdmin();
  const response = await handleDeletionConfirm(new Request('http://localhost/'), {
    admin,
    siteUrl: SITE,
  });
  assertEquals(response.status, 405);
});
