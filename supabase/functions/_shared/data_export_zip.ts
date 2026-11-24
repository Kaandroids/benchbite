// The export as a ZIP (#712, ADR 0168): the user's photos and voice messages, which the export's
// file lists by bucket and path, and the file itself, last, naming where each one is in the ZIP or
// that it could not be read. The app's and the website's exports are this same ZIP, written to
// storage and downloaded from there (ADR 0169).
import { strToU8, Zip, ZipPassThrough } from 'fflate';

import { isObject } from './json.ts';
import { emptyFolder } from './storage.ts';
import { type Client, logError } from './supabase.ts';

/** The ZIP's name, with the day it was made, as the app's and the website's exports name it. */
export const zipFileName = (made: Date) => `benchbite-data-${made.toISOString().slice(0, 10)}.zip`;

/** The file's own name in the ZIP. */
export const EXPORT_JSON = 'benchbite-data.json';

/** A photo or voice message, as the export lists it. */
type Media = { bucket: string; path: string };

const isMedia = (value: unknown): value is Media =>
  isObject(value) && typeof value.bucket === 'string' && typeof value.path === 'string';

/**
 * Where a file goes in the ZIP: under media/ and its bucket, without the user's own folder, which
 * every path starts with: media/coach-media/12/photo.jpg.
 */
export const mediaEntry = ({ bucket, path }: Media) =>
  `media/${bucket}/${path.slice(path.indexOf('/') + 1)}`;

/**
 * Whether a path stays in its folder: one with an empty, . or .. part could name another user's
 * file. The same rule as the list of media in export_user_data() (ADR 0168).
 */
const staysInFolder = (path: string) =>
  path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');

/**
 * Streams the ZIP of an export, a file at a time as the reader asks for more, so that no more than
 * one file is held at once. The media are stored as they are, as photos and voice messages are
 * compressed already; one that cannot be read is left out, and the file says so.
 */
export function exportZip(admin: Client, exported: unknown): ReadableStream<Uint8Array> {
  const listed = isObject(exported) && Array.isArray(exported.media) ? exported.media : [];
  const media = listed.filter(isMedia);
  const placed: Record<string, unknown>[] = [];
  let next = 0;
  let zip: Zip;
  const add = (name: string, data: Uint8Array) => {
    const entry = new ZipPassThrough(name);
    zip.add(entry);
    entry.push(data, true);
  };
  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        zip = new Zip((error, chunk, final) => {
          if (error) return controller.error(error);
          controller.enqueue(chunk);
          if (final) controller.close();
        });
      },
      // One file a call, so that the next is read only once the reader has taken this one; a file
      // left out adds nothing to the stream, so the call goes on to the next.
      async pull() {
        for (;;) {
          const item = media.at(next);
          next += 1;
          if (!item) {
            const file = isObject(exported) ? { ...exported, media: placed } : exported;
            add(EXPORT_JSON, strToU8(JSON.stringify(file, null, 2)));
            zip.end();
            return;
          }
          if (!staysInFolder(item.path)) {
            placed.push({ ...item, missing: true });
            continue;
          }
          const { data, error } = await admin.storage.from(item.bucket).download(item.path);
          if (error || !data) {
            logError('Reading a file for an export failed', error);
            placed.push({ ...item, missing: true });
            continue;
          }
          const file = mediaEntry(item);
          add(file, new Uint8Array(await data.arrayBuffer()));
          placed.push({ ...item, file });
          return;
        }
      },
      // The reader went away: nothing more is read.
      cancel() {
        next = media.length + 1;
      },
    },
    { highWaterMark: 1 },
  );
}

/** The bucket of the ZIPs being downloaded, one folder per user (ADR 0169). */
export const EXPORTS_BUCKET = 'data-exports';

/** How long the link to a stored ZIP works: an hour, for a slow or retried download. */
export const LINK_SECONDS = 3600;

/**
 * Writes the ZIP of an export to storage, in place of the user's earlier one, and gives a link
 * that downloads it under its name. Downloading from storage is not bound by the function's time
 * limit, however large the ZIP and however slow the reader (ADR 0169). Throws when it cannot.
 */
export async function storeExport(
  admin: Client,
  userId: string,
  exported: unknown,
  made: Date,
): Promise<string> {
  await emptyFolder(admin, EXPORTS_BUCKET, userId);
  const bucket = admin.storage.from(EXPORTS_BUCKET);
  const path = `${userId}/${made.getTime()}.zip`;
  const { error } = await bucket.upload(path, exportZip(admin, exported), {
    contentType: 'application/zip',
    duplex: 'half',
  });
  if (error) throw error;
  const { data, error: signError } = await bucket.createSignedUrl(path, LINK_SECONDS, {
    download: zipFileName(made),
  });
  if (signError) throw signError;
  return data.signedUrl;
}
