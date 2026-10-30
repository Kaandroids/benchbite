import { assertEquals } from '@std/assert';

import { MEDIA_BUCKET } from '../_shared/coach/media.ts';
import { BATCH_SIZE, handlePurgeRequest, PAGE_SIZE, type PurgeContext } from './handler.ts';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';

type Row = { thread_id: number; user_id: string; queued_at: string; attempts: number };

/** The most paths the Storage API removes in one request. */
const MAX_REMOVE = 1000;
const COLUMNS = ['thread_id', 'user_id', 'queued_at', 'attempts'];

/**
 * A stand-in for the service role client: the queue table, with the calls the handler makes, and
 * the coach-media bucket. Like the real ones, it refuses other tables, buckets and columns, lists
 * only the direct children of a folder (sub-folders as entries without an id), at most `limit` of
 * them, and refuses to remove more than 1000 paths at once, answering with the photos it removed.
 * `failing` folders fail to list, storage removes at most `removable` photos per request (none
 * when `stuck`), and with `deleteError` folders cannot be removed from the queue.
 */
function fakeAdmin(
  queue: Row[],
  objects: Set<string>,
  {
    failing = [],
    stuck = false,
    removable = Infinity,
    queueError = false,
    deleteError = false,
  } = {} as {
    failing?: string[];
    stuck?: boolean;
    removable?: number;
    queueError?: boolean;
    deleteError?: boolean;
  },
) {
  const refused = (message: string) => ({ data: null, error: { code: 'PGRST', message } });
  const table = (name: string) => {
    if (name !== 'coach_media_deletions') throw new Error(`Unknown table ${name}`);
    return {
      select: (columns: string) => {
        const names = columns.split(',').map((column) => column.trim());
        const orders: string[] = [];
        const query = {
          order: (column: string) => (orders.push(column), query),
          limit: (count: number) => {
            if (queueError) return Promise.resolve(refused('Queue unavailable'));
            if (names.some((column) => !COLUMNS.includes(column))) {
              return Promise.resolve(refused('Unknown column'));
            }
            const rows = [...queue].sort((a, b) => {
              for (const column of orders) {
                const [x, y] = [a[column as keyof Row], b[column as keyof Row]];
                if (x !== y) return x < y ? -1 : 1;
              }
              return 0;
            });
            const data = rows
              .slice(0, count)
              .map((row) =>
                Object.fromEntries(names.map((column) => [column, row[column as keyof Row]])),
              );
            return Promise.resolve({ data, error: null });
          },
        };
        return query;
      },
      delete: () => ({
        in: (column: string, values: number[]) => {
          if (column !== 'thread_id') return Promise.resolve(refused('Unknown column'));
          if (deleteError) return Promise.resolve(refused('Queue unavailable'));
          for (let i = queue.length - 1; i >= 0; i--) {
            if (values.includes(queue[i].thread_id)) queue.splice(i, 1);
          }
          return Promise.resolve({ data: null, error: null });
        },
      }),
      update: (values: Partial<Row>) => ({
        eq: (column: string, value: number) => {
          if (column !== 'thread_id') return Promise.resolve(refused('Unknown column'));
          for (const row of queue) if (row.thread_id === value) Object.assign(row, values);
          return Promise.resolve({ data: null, error: null });
        },
      }),
    };
  };
  const bucket = (name: string) => {
    if (name !== MEDIA_BUCKET) throw new Error(`Unknown bucket ${name}`);
    return {
      list: (folder: string, { limit = 100 }: { limit?: number } = {}) => {
        if (failing.includes(folder)) {
          return Promise.resolve({ data: null, error: new Error('Storage unavailable') });
        }
        const children = new Map<string, string | null>();
        for (const path of [...objects].sort()) {
          if (!path.startsWith(`${folder}/`)) continue;
          const [child, ...rest] = path.slice(folder.length + 1).split('/');
          children.set(child, rest.length > 0 ? null : `id-${path}`);
        }
        const data = [...children].slice(0, limit).map(([name, id]) => ({ name, id }));
        return Promise.resolve({ data, error: null });
      },
      remove: (paths: string[]) => {
        if (paths.length > MAX_REMOVE) {
          return Promise.resolve({ data: null, error: new Error('Too many paths') });
        }
        const removed = stuck
          ? []
          : paths.slice(0, removable).filter((path) => objects.delete(path));
        return Promise.resolve({ data: removed.map((name) => ({ name })), error: null });
      },
    };
  };
  const admin = { from: table, storage: { from: bucket } } as unknown as PurgeContext['admin'];
  return { admin };
}

const queued = (thread_id: number, user_id: string, minute: number, attempts = 0): Row => ({
  thread_id,
  user_id,
  queued_at: `2026-10-31T10:${String(minute).padStart(2, '0')}:00Z`,
  attempts,
});

/** `count` photos in a thread's folder. */
const photos = (user: string, thread: number, count: number) =>
  Array.from({ length: count }, (_, i) => `${user}/${thread}/${i}.jpg`);

const purge = (admin: PurgeContext['admin'], method = 'POST') =>
  handlePurgeRequest(new Request('http://localhost/purge-coach-media', { method }), { admin });

Deno.test('purges the queued folders and leaves the rest', async () => {
  const queue = [queued(1, A, 0), queued(2, B, 1)];
  const objects = new Set([
    ...photos(A, 1, PAGE_SIZE * 2 + 50),
    ...photos(B, 2, 1),
    ...photos(A, 3, 2),
    ...photos(B, 4, 1),
  ]);
  const { admin } = fakeAdmin(queue, objects);

  const response = await purge(admin);

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { purged: 2, failed: 0 });
  assertEquals(queue, []);
  assertEquals([...objects].sort(), [...photos(A, 3, 2), ...photos(B, 4, 1)].sort());
});

Deno.test('dequeues a chat that had no photos', async () => {
  const queue = [queued(1, A, 0)];
  const { admin } = fakeAdmin(queue, new Set(photos(A, 10, 1)));

  assertEquals(await (await purge(admin)).json(), { purged: 1, failed: 0 });
  assertEquals(queue, []);
});

Deno.test('keeps a failing folder for the next run and counts the attempt', async () => {
  const queue = [queued(1, A, 0), queued(2, B, 1)];
  const objects = new Set([...photos(A, 1, 2), ...photos(B, 2, 2)]);
  const { admin } = fakeAdmin(queue, objects, { failing: [`${A}/1`] });

  assertEquals(await (await purge(admin)).json(), { purged: 1, failed: 1 });
  assertEquals(queue, [queued(1, A, 0, 1)]);
  assertEquals([...objects], photos(A, 1, 2));
});

Deno.test('fails a folder when storage removes nothing, instead of listing it again', async () => {
  const queue = [queued(1, A, 0)];
  const { admin } = fakeAdmin(queue, new Set(photos(A, 1, 1)), { stuck: true });

  assertEquals(await (await purge(admin)).json(), { purged: 0, failed: 1 });
  assertEquals(queue, [queued(1, A, 0, 1)]);
});

Deno.test('lists a folder again when storage removed only some of a page', async () => {
  const queue = [queued(1, A, 0)];
  const objects = new Set(photos(A, 1, PAGE_SIZE + 10));
  const { admin } = fakeAdmin(queue, objects, { removable: 30 });

  assertEquals(await (await purge(admin)).json(), { purged: 1, failed: 0 });
  assertEquals(queue, []);
  assertEquals(objects.size, 0);
});

Deno.test('keeps an emptied folder queued when it cannot be dequeued', async () => {
  const queue = [queued(1, A, 0)];
  const objects = new Set(photos(A, 1, 2));
  const failing = fakeAdmin(queue, objects, { deleteError: true });

  assertEquals(await (await purge(failing.admin)).json(), { purged: 1, failed: 0 });
  // Not counted as a failed attempt: the photos are gone.
  assertEquals(queue, [queued(1, A, 0)]);
  assertEquals(objects.size, 0);

  // The next run finds the folder empty and dequeues it.
  const { admin } = fakeAdmin(queue, objects);
  assertEquals(await (await purge(admin)).json(), { purged: 1, failed: 0 });
  assertEquals(queue, []);
});

Deno.test('takes one batch, folders that failed before last', async () => {
  const queue = [
    queued(0, A, 0, 3),
    ...Array.from({ length: BATCH_SIZE }, (_, i) => queued(i + 1, A, i + 1)),
  ];
  const { admin } = fakeAdmin(queue, new Set());

  assertEquals(await (await purge(admin)).json(), { purged: BATCH_SIZE, failed: 0 });
  assertEquals(queue, [queued(0, A, 0, 3)]);
});

Deno.test('answers 503 when the queue cannot be read', async () => {
  const { admin } = fakeAdmin([queued(1, A, 0)], new Set(), { queueError: true });

  assertEquals((await purge(admin)).status, 503);
});

Deno.test('accepts only POST', async () => {
  const queue = [queued(1, A, 0)];
  const { admin } = fakeAdmin(queue, new Set());

  assertEquals((await purge(admin, 'GET')).status, 405);
  assertEquals(queue.length, 1);
});
