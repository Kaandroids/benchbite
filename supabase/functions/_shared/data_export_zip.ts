// The export as a ZIP (#712, ADR 0168): the user's photos and voice messages, which the export's
// file lists by bucket and path, and the file itself, last, naming where each one is in the ZIP or
// that it could not be read. The app's and the website's exports are this same ZIP, written to
// storage and downloaded from there (ADR 0169).
import { strToU8, Zip, ZipPassThrough } from 'fflate';

import { isObject } from './json.ts';
import { PAGE_SIZE } from './storage.ts';
import { type Client, logError } from './supabase.ts';

/** The ZIP's name, with the day it was made, as the app's and the website's exports name it. */
export const zipFileName = (made: Date) => `benchbite-data-${made.toISOString().slice(0, 10)}.zip`;

/** How many media are read at once, ahead of the one added to the ZIP. */
export const READ_AHEAD = 4;

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
  /** The files being read, by their place in the list: null for one that cannot be. */
  const reads = new Map<number, Promise<Uint8Array | null>>();
  const read = (index: number) => {
    const item = media.at(index);
    if (!item || reads.has(index)) return;
    reads.set(
      index,
      staysInFolder(item.path)
        ? admin.storage
            .from(item.bucket)
            .download(item.path)
            .then(async ({ data, error }) => {
              if (error || !data) {
                logError('Reading a file for an export failed', error);
                return null;
              }
              return new Uint8Array(await data.arrayBuffer());
            })
        : Promise.resolve(null),
    );
  };
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
          const index = next;
          const item = media.at(index);
          next += 1;
          if (!item) {
            const file = isObject(exported) ? { ...exported, media: placed } : exported;
            add(EXPORT_JSON, strToU8(JSON.stringify(file, null, 2)));
            zip.end();
            return;
          }
          // This file and the next few are read at once, which shortens the build while holding
          // only a few files (ADR 0169); they are added in order.
          for (let ahead = index; ahead < index + READ_AHEAD; ahead += 1) read(ahead);
          const bytes = await reads.get(index);
          reads.delete(index);
          if (!bytes) {
            placed.push({ ...item, missing: true });
            continue;
          }
          const file = mediaEntry(item);
          add(file, bytes);
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

/** Removes the user's exports but `keep`; a failure is logged, as the purge removes them later. */
async function removeOtherExports(admin: Client, userId: string, keep: string): Promise<void> {
  const bucket = admin.storage.from(EXPORTS_BUCKET);
  const { data: listed, error } = await bucket.list(userId, { limit: PAGE_SIZE });
  const others = (listed ?? [])
    .map((entry) => `${userId}/${entry.name}`)
    .filter((path) => path !== keep);
  const { error: removeError } = others.length ? await bucket.remove(others) : { error: null };
  if (error || removeError)
    logError('Removing a user’s earlier exports failed', error ?? removeError);
}

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
  /** STORAGE_PUBLIC_URL, which only the local stack sets (publicLink()). */
  publicUrl?: string,
): Promise<string> {
  const bucket = admin.storage.from(EXPORTS_BUCKET);
  const path = `${userId}/${made.getTime()}.zip`;
  const { error } = await bucket.upload(path, exportZip(admin, exported), {
    contentType: 'application/zip',
    duplex: 'half',
  });
  if (error) throw error;
  // Only once the new one is there: a failed upload leaves the earlier export and its link.
  await removeOtherExports(admin, userId, path);
  const { data, error: signError } = await bucket.createSignedUrl(path, LINK_SECONDS, {
    download: zipFileName(made),
  });
  if (signError) throw signError;
  return publicLink(data.signedUrl, publicUrl);
}

/**
 * The link as the phone or browser reaches it. Locally the functions sign with the address Supabase
 * has inside Docker, which nothing outside reaches; STORAGE_PUBLIC_URL names the one they do. The
 * hosted project signs with its public address and sets none.
 */
export function publicLink(signed: string, publicUrl: string | undefined): string {
  if (!publicUrl) return signed;
  const url = new URL(signed);
  const base = new URL(publicUrl);
  return new URL(`${url.pathname}${url.search}`, base).toString();
}
