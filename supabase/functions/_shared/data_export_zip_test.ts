import { assertEquals, assertRejects } from '@std/assert';
import { strFromU8, unzipSync } from 'fflate';

import {
  EXPORT_JSON,
  exportZip,
  mediaEntry,
  publicLink,
  READ_AHEAD,
  storeExport,
} from './data_export_zip.ts';
import { fakeExportAdmin } from './fake_export_storage.ts';
import type { Client } from './supabase.ts';

const A = '00000000-0000-0000-0000-00000000000a';

/** A stand-in for the service role's storage: the files it holds, by bucket and path. */
function admin(files: Record<string, string>) {
  const read: string[] = [];
  const client = {
    storage: {
      from: (bucket: string) => ({
        download: (path: string) => {
          read.push(`${bucket}:${path}`);
          const body = files[`${bucket}:${path}`];
          return Promise.resolve(
            body === undefined
              ? { data: null, error: { message: 'Object not found' } }
              : { data: new Blob([body]), error: null },
          );
        },
      }),
    },
  } as unknown as Client;
  return { client, read };
}

async function unzip(stream: ReadableStream<Uint8Array>) {
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return unzipSync(bytes);
}

const exported = (media: unknown[]) => ({
  format: 'benchbite-export',
  version: 2,
  data: { weight_entries: [{ weight_kg: 70 }] },
  media,
});

Deno.test('puts each photo and voice message beside the file, and names where', async () => {
  const { client } = admin({
    [`coach-media:${A}/12/photo.jpg`]: 'jpeg',
    [`exercise-photos:${A}/hip-thrust.jpg`]: 'hip',
  });
  const entries = await unzip(
    exportZip(
      client,
      exported([
        { bucket: 'coach-media', path: `${A}/12/photo.jpg`, bytes: 4 },
        { bucket: 'exercise-photos', path: `${A}/hip-thrust.jpg`, bytes: 3 },
      ]),
    ),
  );
  assertEquals(Object.keys(entries).sort(), [
    EXPORT_JSON,
    'media/coach-media/12/photo.jpg',
    'media/exercise-photos/hip-thrust.jpg',
  ]);
  assertEquals(strFromU8(entries['media/coach-media/12/photo.jpg']), 'jpeg');
  const file = JSON.parse(strFromU8(entries[EXPORT_JSON]));
  assertEquals(file.data.weight_entries, [{ weight_kg: 70 }]);
  assertEquals(file.media, [
    {
      bucket: 'coach-media',
      path: `${A}/12/photo.jpg`,
      bytes: 4,
      file: 'media/coach-media/12/photo.jpg',
    },
    {
      bucket: 'exercise-photos',
      path: `${A}/hip-thrust.jpg`,
      bytes: 3,
      file: 'media/exercise-photos/hip-thrust.jpg',
    },
  ]);
});

Deno.test('leaves out a file it cannot read, and says so in the file', async () => {
  const { client } = admin({});
  const entries = await unzip(
    exportZip(client, exported([{ bucket: 'coach-media', path: `${A}/12/gone.jpg` }])),
  );
  assertEquals(Object.keys(entries), [EXPORT_JSON]);
  assertEquals(JSON.parse(strFromU8(entries[EXPORT_JSON])).media, [
    { bucket: 'coach-media', path: `${A}/12/gone.jpg`, missing: true },
  ]);
});

Deno.test('makes a ZIP of the file alone when there are no media, and reads nothing', async () => {
  const { client, read } = admin({});
  const entries = await unzip(exportZip(client, exported([])));
  assertEquals(Object.keys(entries), [EXPORT_JSON]);
  assertEquals(read, []);
});

Deno.test('names a file in the ZIP by its bucket, without the user’s folder', () => {
  assertEquals(
    mediaEntry({ bucket: 'coach-media', path: `${A}/7/voice.m4a` }),
    'media/coach-media/7/voice.m4a',
  );
});

Deno.test('reads only a few files ahead of what the reader has taken', async () => {
  const files = Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [`coach-media:${A}/1/${i}.jpg`, 'x'.repeat(1000)]),
  );
  const { client, read } = admin(files);
  const stream = exportZip(
    client,
    exported(Object.keys(files).map((key) => ({ bucket: 'coach-media', path: key.split(':')[1] }))),
  );
  // Nothing read from the stream yet: the event loop settles with at most one file read ahead.
  await new Promise((resolve) => setTimeout(resolve, 20));
  assertEquals(read.length <= READ_AHEAD, true, `read ${read.length} files ahead`);
  const entries = await unzip(stream);
  assertEquals(Object.keys(entries).length, 11);
});

Deno.test('never reads a path that leaves the user’s folder, and says it is missing', async () => {
  const { client, read } = admin({ [`exercise-photos:${A}/x.jpg`]: 'mine' });
  const entries = await unzip(
    exportZip(
      client,
      exported([
        { bucket: 'exercise-photos', path: `${A}/../00000000-0000-0000-0000-00000000000b/x.jpg` },
        { bucket: 'exercise-photos', path: `${A}/x.jpg` },
      ]),
    ),
  );
  assertEquals(read, [`exercise-photos:${A}/x.jpg`]);
  assertEquals(Object.keys(entries).sort(), [EXPORT_JSON, 'media/exercise-photos/x.jpg']);
  assertEquals(JSON.parse(strFromU8(entries[EXPORT_JSON]!)).media[0].missing, true);
});

Deno.test('points a link at the address outside Docker, when one is set', () => {
  const signed = 'http://kong:8000/storage/v1/object/sign/data-exports/a/1.zip?token=t';
  assertEquals(
    publicLink(signed, 'http://192.168.1.20:54321'),
    'http://192.168.1.20:54321/storage/v1/object/sign/data-exports/a/1.zip?token=t',
  );
  assertEquals(publicLink(signed, undefined), signed);
});

Deno.test(
  'keeps the earlier export when the new one cannot be stored, and replaces it when it can',
  async () => {
    const failing = fakeExportAdmin({ uploadFails: true });
    failing.uploaded[`${A}/1.zip`] = new Uint8Array([1]);
    await assertRejects(() => storeExport(failing.client, A, exported([]), new Date(2)));
    assertEquals(Object.keys(failing.uploaded), [`${A}/1.zip`]);

    const working = fakeExportAdmin();
    working.uploaded[`${A}/1.zip`] = new Uint8Array([1]);
    await storeExport(working.client, A, exported([]), new Date(2));
    assertEquals(Object.keys(working.uploaded), [`${A}/2.zip`]);
  },
);
