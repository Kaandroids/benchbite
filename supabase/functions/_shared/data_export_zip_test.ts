import { assertEquals } from '@std/assert';
import { strFromU8, unzipSync } from 'fflate';

import { EXPORT_JSON, exportZip, mediaEntry } from './data_export_zip.ts';
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
