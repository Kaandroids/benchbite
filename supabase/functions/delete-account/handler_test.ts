import { assertEquals } from '@std/assert';

import { EXERCISE_PHOTOS_BUCKET } from '../_shared/exercise_photos.ts';
import { codeHash } from '../_shared/deletion_code.ts';
import { PAGE_SIZE } from '../_shared/storage.ts';
import { handleDeleteRequest, type PasswordCheck } from './handler.ts';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';

type Options = {
  storageError?: boolean;
  /** Storage fails only once the user is deleted. */
  storageErrorAfter?: boolean;
  /** A photo another device uploads just as the user is deleted. */
  uploadedLate?: string;
  deleteError?: { status: number } | null;
  /** The answers of the database's functions, by name. */
  rpc?: Record<string, { data: string | null; error: { message: string } | null }>;
  /** The user is gone already, as after a try whose answer was lost. */
  gone?: boolean;
  /** The user as Auth stores them: a guest, or an account with its address. */
  stored?: 'guest' | 'account';
  email?: string;
  /** Auth cannot say who the user is. */
  readError?: boolean;
};

/**
 * A stand-in for the service role client: the exercise-photos bucket as a set of paths, refusing
 * other buckets, and auth's deleting of users, which records the ids and the order of the calls.
 */
function fakeAdmin(
  objects: Set<string>,
  {
    storageError,
    storageErrorAfter,
    uploadedLate,
    deleteError = null,
    rpc = {},
    gone,
    stored = 'account',
    email = 'kaan@example.com',
    readError,
  }: Options = {},
) {
  const calls: string[] = [];
  let deleted = false;
  const admin = {
    rpc: (fn: string, args: Record<string, string>) => {
      calls.push(`${fn} ${Object.values(args).join(' ')}`);
      return Promise.resolve(rpc[fn] ?? { data: null, error: { message: `Unexpected ${fn}` } });
    },
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
        getUserById: () =>
          Promise.resolve(
            gone
              ? { data: null, error: { status: 404 } }
              : readError
                ? { data: null, error: { status: 500 } }
                : {
                    data: {
                      user: {
                        is_anonymous: stored === 'guest',
                        email: stored === 'account' ? email : undefined,
                      },
                    },
                    error: null,
                  },
          ),
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

const post = (body?: unknown) =>
  new Request('http://localhost/delete-account', {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/**
 * A request whose password must not be checked: a guest's, which needs no proof, or one that brings
 * none. Whether the user is a guest is the fake admin's stored user, as the handler reads it.
 */
const noPassword = (admin: never, userId = A) => ({
  admin,
  userId,
  checkPassword: () => Promise.reject(new Error('A guest has no password')),
});

/** An account's request, whose password is `secret`; Auth is busy for `busy`. */
const account = (admin: never, passwords: string[] = []) => ({
  admin,
  userId: A,
  checkPassword: (email: string, password: string) => {
    passwords.push(`${email} ${password}`);
    return Promise.resolve<PasswordCheck>(
      password === 'secret' ? 'right' : password === 'busy' ? 'busy' : 'wrong',
    );
  },
});

Deno.test('removes only the user’s photos, a page at a time, and then the user', async () => {
  const objects = new Set([
    ...Array.from({ length: PAGE_SIZE + 10 }, (_, index) => `${A}/${index}.jpg`),
    `${B}/kept.jpg`,
  ]);
  const { admin, calls } = fakeAdmin(objects, { stored: 'guest' });

  const response = await handleDeleteRequest(post(), noPassword(admin));

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { deleted: true });
  assertEquals([...objects], [`${B}/kept.jpg`]);
  assertEquals(calls, ['remove', 'remove', `delete ${A}`]);
});

Deno.test('deletes a user without photos', async () => {
  const { admin, calls } = fakeAdmin(new Set(), { stored: 'guest' });

  const response = await handleDeleteRequest(post(), noPassword(admin));

  assertEquals(response.status, 200);
  assertEquals(calls, [`delete ${A}`]);
});

Deno.test('removes a photo uploaded while the user was being deleted', async () => {
  const objects = new Set<string>();
  const { admin } = fakeAdmin(objects, { stored: 'guest', uploadedLate: `${A}/late.jpg` });

  await handleDeleteRequest(post(), noPassword(admin));

  assertEquals([...objects], []);
});

Deno.test(
  'answers that the user is deleted when only the last look at the photos fails',
  async () => {
    const { admin } = fakeAdmin(new Set(), { stored: 'guest', storageErrorAfter: true });

    const response = await handleDeleteRequest(post(), noPassword(admin));

    assertEquals(response.status, 200);
  },
);

Deno.test('keeps the user when the photos cannot be removed', async () => {
  const { admin, calls } = fakeAdmin(new Set([`${A}/0.jpg`]), {
    stored: 'guest',
    storageError: true,
  });

  const response = await handleDeleteRequest(post(), noPassword(admin));

  assertEquals(response.status, 503);
  assertEquals(await response.json(), { error: 'unavailable' });
  assertEquals(calls, []);
});

Deno.test('says so when the user cannot be deleted', async () => {
  const { admin } = fakeAdmin(new Set(), { stored: 'guest', deleteError: { status: 500 } });

  const response = await handleDeleteRequest(post(), noPassword(admin));

  assertEquals(response.status, 503);
});

Deno.test('counts a user already gone as deleted', async () => {
  const { admin } = fakeAdmin(new Set(), { stored: 'guest', deleteError: { status: 404 } });

  const response = await handleDeleteRequest(post(), noPassword(admin));

  assertEquals(response.status, 200);
});

Deno.test('takes only POST requests', async () => {
  const { admin, calls } = fakeAdmin(new Set([`${A}/0.jpg`]), { stored: 'guest' });

  const response = await handleDeleteRequest(
    new Request('http://localhost/delete-account'),
    noPassword(admin),
  );

  assertEquals(response.status, 405);
  assertEquals(calls, []);
});

const answer = (data: string) => ({ data, error: null });
const RIGHT = answer('right');
const ALLOWED = answer('allowed');
const DOWN = { data: null, error: { message: 'down' } };

Deno.test('deletes an account with its code', async () => {
  const { admin, calls } = fakeAdmin(new Set(), {
    rpc: { check_account_deletion_code: RIGHT },
  });

  const response = await handleDeleteRequest(post({ code: '481027' }), account(admin));

  assertEquals(response.status, 200);
  assertEquals(calls, [
    `check_account_deletion_code ${A} ${await codeHash(A, '481027')}`,
    `delete ${A}`,
  ]);
});

Deno.test('keeps an account whose code is wrong', async () => {
  const { admin, calls } = fakeAdmin(new Set(), {
    rpc: { check_account_deletion_code: answer('wrong') },
  });

  const response = await handleDeleteRequest(post({ code: '000000' }), account(admin));

  assertEquals(response.status, 403);
  assertEquals(await response.json(), { error: 'wrong_code' });
  assertEquals(calls.length, 1);
});

Deno.test('deletes an account with its password, counting the try first', async () => {
  const passwords: string[] = [];
  const { admin, calls } = fakeAdmin(new Set(), {
    rpc: { take_account_deletion_password_try: ALLOWED },
  });

  const response = await handleDeleteRequest(
    post({ password: 'secret' }),
    account(admin, passwords),
  );

  assertEquals(response.status, 200);
  assertEquals(passwords, ['kaan@example.com secret']);
  assertEquals(calls, [`take_account_deletion_password_try ${A}`, `delete ${A}`]);
});

Deno.test('keeps an account whose password is wrong', async () => {
  const { admin, calls } = fakeAdmin(new Set(), {
    rpc: { take_account_deletion_password_try: ALLOWED },
  });

  const response = await handleDeleteRequest(post({ password: 'guess' }), account(admin));

  assertEquals(response.status, 403);
  assertEquals(await response.json(), { error: 'wrong_password' });
  assertEquals(calls, [`take_account_deletion_password_try ${A}`]);
});

Deno.test('tries no password once the tries are used up', async () => {
  const passwords: string[] = [];
  const { admin } = fakeAdmin(new Set(), {
    rpc: { take_account_deletion_password_try: answer('too_many') },
  });

  const response = await handleDeleteRequest(
    post({ password: 'secret' }),
    account(admin, passwords),
  );

  assertEquals(response.status, 429);
  assertEquals(await response.json(), { error: 'too_many_tries' });
  assertEquals(passwords, []);
});

Deno.test('keeps an account that brings no proof', async () => {
  for (const body of [undefined, {}, { code: '12345' }, { code: 481027 }, { password: '' }]) {
    const { admin, calls } = fakeAdmin(new Set());

    const response = await handleDeleteRequest(post(body), account(admin));

    assertEquals(response.status, 400);
    assertEquals(await response.json(), { error: 'proof_required' });
    assertEquals(calls, []);
  }
});

Deno.test('keeps an account when its proof cannot be checked', async () => {
  const failing = {
    ...account(
      fakeAdmin(new Set(), {
        rpc: { take_account_deletion_password_try: ALLOWED },
      }).admin,
    ),
    checkPassword: () => Promise.reject(new Error('Auth is down')),
  };
  for (const [body, context] of [
    [
      { code: '481027' },
      account(
        fakeAdmin(new Set(), {
          rpc: { check_account_deletion_code: DOWN },
        }).admin,
      ),
    ],
    [
      { password: 'secret' },
      account(
        fakeAdmin(new Set(), {
          rpc: { take_account_deletion_password_try: DOWN },
        }).admin,
      ),
    ],
    [{ password: 'secret' }, failing],
  ] as const) {
    const response = await handleDeleteRequest(post(body), context);

    assertEquals(response.status, 503);
  }
});

Deno.test('asks a guest for no proof', async () => {
  const { admin, calls } = fakeAdmin(new Set(), { stored: 'guest' });

  const response = await handleDeleteRequest(post({ code: '000000' }), noPassword(admin));

  assertEquals(response.status, 200);
  assertEquals(calls, [`delete ${A}`]);
});

Deno.test('tells an expired code and too many wrong codes apart', async () => {
  for (const [said, refusal, status] of [
    ['expired', 'code_expired', 410],
    ['too_many', 'too_many_tries', 429],
  ] as const) {
    const { admin, calls } = fakeAdmin(new Set(), {
      rpc: { check_account_deletion_code: answer(said) },
    });

    const response = await handleDeleteRequest(post({ code: '481027' }), account(admin));

    assertEquals(response.status, status);
    assertEquals(await response.json(), { error: refusal });
    assertEquals(calls.length, 1);
  }
});

Deno.test('tries no password that changed lately, or while all tries are taken', async () => {
  for (const [said, refusal] of [
    ['recently_changed', 'password_recently_changed'],
    ['busy', 'busy'],
  ] as const) {
    const passwords: string[] = [];
    const { admin } = fakeAdmin(new Set(), {
      rpc: { take_account_deletion_password_try: answer(said) },
    });

    const response = await handleDeleteRequest(
      post({ password: 'secret' }),
      account(admin, passwords),
    );

    assertEquals(await response.json(), { error: refusal });
    assertEquals(passwords, []);
  }
});

Deno.test('asks to wait when Auth takes no more sign-ins', async () => {
  const { admin, calls } = fakeAdmin(new Set(), {
    rpc: { take_account_deletion_password_try: ALLOWED },
  });

  const response = await handleDeleteRequest(post({ password: 'busy' }), account(admin));

  assertEquals(response.status, 429);
  assertEquals(await response.json(), { error: 'busy' });
  assertEquals(calls, [`take_account_deletion_password_try ${A}`]);
});

Deno.test('counts an account already gone as deleted, without asking for proof', async () => {
  const { admin, calls } = fakeAdmin(new Set(), {
    gone: true,
  });

  const response = await handleDeleteRequest(post({ code: '481027' }), account(admin));

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { deleted: true });
  assertEquals(calls, []);
});

Deno.test('asks for proof when a token still says guest after the account was made', async () => {
  // The token's claims are not read: the stored user is an account, which needs proof.
  const { admin, calls } = fakeAdmin(new Set());

  const response = await handleDeleteRequest(post(), noPassword(admin));

  assertEquals(response.status, 400);
  assertEquals(await response.json(), { error: 'proof_required' });
  assertEquals(calls, []);
});

Deno.test('checks the password against the address as stored', async () => {
  const passwords: string[] = [];
  const { admin } = fakeAdmin(new Set(), {
    email: 'new@example.com',
    rpc: { take_account_deletion_password_try: ALLOWED },
  });

  await handleDeleteRequest(post({ password: 'secret' }), account(admin, passwords));

  assertEquals(passwords, ['new@example.com secret']);
});

Deno.test('deletes nothing when Auth cannot say who the user is', async () => {
  const { admin, calls } = fakeAdmin(new Set(), { readError: true });

  const response = await handleDeleteRequest(post(), noPassword(admin));

  assertEquals(response.status, 503);
  assertEquals(calls, []);
});
