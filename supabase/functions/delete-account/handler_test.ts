import { assertEquals } from '@std/assert';

import { EXERCISE_PHOTOS_BUCKET } from '../_shared/exercise_photos.ts';
import { PAGE_SIZE } from '../_shared/storage.ts';
import { handleDeleteRequest } from './handler.ts';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';

type Options = {
  storageError?: boolean;
  /** Storage fails only once the user is deleted. */
  storageErrorAfter?: boolean;
  /** A photo another device uploads just as the user is deleted. */
  uploadedLate?: string;
  deleteError?: { status: number } | null;
};

/**
 * A stand-in for the service role client: the exercise-photos bucket as a set of paths, refusing
 * other buckets, and auth's deleting of users, which records the ids and the order of the calls.
 */
function fakeAdmin(
  objects: Set<string>,
  { storageError, storageErrorAfter, uploadedLate, deleteError = null }: Options = {},
) {
  const calls: string[] = [];
  let deleted = false;
  const admin = {
    storage: {
      from: (bucket: string) => {
        if (bucket !== EXERCISE_PHOTOS_BUCKET) throw new Error(`Unexpected bucket ${bucket}`);
        return {
          list: (folder: string, { limit }: { limit: number }) => {
            if (storageError || (storageErrorAfter && deleted)) {
              return Promise.resolve({ data: null, error: new Error('down') });
            }
            const names = [...objects]
              .filter((path) => path.startsWith(`${folder}/`))
              .slice(0, limit)
              .map((path) => ({ id: path, name: path.slice(folder.length + 1) }));
            return Promise.resolve({ data: names, error: null });
          },
          remove: (paths: string[]) => {
            calls.push('remove');
            paths.forEach((path) => objects.delete(path));
            return Promise.resolve({ data: paths, error: null });
          },
        };
      },
    },
    auth: {
      admin: {
        deleteUser: (id: string) => {
          calls.push(`delete ${id}`);
          deleted = true;
          if (uploadedLate) objects.add(uploadedLate);
          return Promise.resolve({ data: {}, error: deleteError });
        },
      },
    },
  };
  return { admin: admin as never, calls };
}

const post = () => new Request('http://localhost/delete-account', { method: 'POST' });

Deno.test('removes only the user’s photos, a page at a time, and then the user', async () => {
  const objects = new Set([
    ...Array.from({ length: PAGE_SIZE + 10 }, (_, index) => `${A}/${index}.jpg`),
    `${B}/kept.jpg`,
  ]);
  const { admin, calls } = fakeAdmin(objects);

  const response = await handleDeleteRequest(post(), { admin, userId: A });

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { deleted: true });
  assertEquals([...objects], [`${B}/kept.jpg`]);
  assertEquals(calls, ['remove', 'remove', `delete ${A}`]);
});

Deno.test('deletes a user without photos', async () => {
  const { admin, calls } = fakeAdmin(new Set());

  const response = await handleDeleteRequest(post(), { admin, userId: A });

  assertEquals(response.status, 200);
  assertEquals(calls, [`delete ${A}`]);
});

Deno.test('removes a photo uploaded while the user was being deleted', async () => {
  const objects = new Set<string>();
  const { admin } = fakeAdmin(objects, { uploadedLate: `${A}/late.jpg` });

  await handleDeleteRequest(post(), { admin, userId: A });

  assertEquals([...objects], []);
});

Deno.test(
  'answers that the user is deleted when only the last look at the photos fails',
  async () => {
    const { admin } = fakeAdmin(new Set(), { storageErrorAfter: true });

    const response = await handleDeleteRequest(post(), { admin, userId: A });

    assertEquals(response.status, 200);
  },
);

Deno.test('keeps the user when the photos cannot be removed', async () => {
  const { admin, calls } = fakeAdmin(new Set([`${A}/0.jpg`]), { storageError: true });

  const response = await handleDeleteRequest(post(), { admin, userId: A });

  assertEquals(response.status, 503);
  assertEquals(await response.json(), { error: 'unavailable' });
  assertEquals(calls, []);
});

Deno.test('says so when the user cannot be deleted', async () => {
  const { admin } = fakeAdmin(new Set(), { deleteError: { status: 500 } });

  const response = await handleDeleteRequest(post(), { admin, userId: A });

  assertEquals(response.status, 503);
});

Deno.test('counts a user already gone as deleted', async () => {
  const { admin } = fakeAdmin(new Set(), { deleteError: { status: 404 } });

  const response = await handleDeleteRequest(post(), { admin, userId: A });

  assertEquals(response.status, 200);
});

Deno.test('takes only POST requests', async () => {
  const { admin, calls } = fakeAdmin(new Set([`${A}/0.jpg`]));

  const response = await handleDeleteRequest(new Request('http://localhost/delete-account'), {
    admin,
    userId: A,
  });

  assertEquals(response.status, 405);
  assertEquals(calls, []);
});
