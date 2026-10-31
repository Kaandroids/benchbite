// The photos of a message to Bite (#299, ADR 0062): checked before anything is sent or kept, and
// kept in `coach-media` with the service role once their turn is saved.
import { MEDIA_BUCKET, threadMediaFolder } from '../_shared/coach/media.ts';
import type { ChatPhotoPart, PhotoRefusal } from '../_shared/coach/chat.ts';
import { type Client, logError } from '../_shared/supabase.ts';

/** A photo that passed the checks: its bytes to keep, its base64 data for the model, its size. */
export type CheckedPhoto = { bytes: Uint8Array; data: string; width: number; height: number };

/** Markers that stand alone, without a length: TEM and the restart markers. */
const standalone = (marker: number) => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);

/** A start of frame, which holds the photo's size: SOF0 to SOF15, but DHT, JPG and DAC. */
const isFrame = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

/** APP1, which holds Exif data, or XMP, either of which can hold where and when it was taken. */
const APP1 = 0xe1;
const SOS = 0xda;
const EOI = 0xd9;

/**
 * Reads a JPEG's segments to its end, and gives its size, or why it is refused: not a JPEG, with
 * anything after its end, or with an APP1 segment anywhere, as Exif data is refused, not removed
 * (ADR 0062). The app removes the APP1 segments before it sends a photo, as re-encoding alone can
 * leave a small Exif segment on iOS (ADR 0065).
 */
export function readJpeg(bytes: Uint8Array): { width: number; height: number } | PhotoRefusal {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 'photo_not_jpeg';
  let size: { width: number; height: number } | undefined;
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return 'photo_not_jpeg';
    // A marker may be padded with any number of 0xFF.
    while (bytes[i] === 0xff) i++;
    if (i >= bytes.length) return 'photo_not_jpeg';
    const marker = bytes[i++];
    if (marker === EOI) {
      // Nothing may follow the end, as other images and their Exif data can.
      return size && i === bytes.length ? size : 'photo_not_jpeg';
    }
    if (standalone(marker)) continue;
    if (i + 2 > bytes.length) return 'photo_not_jpeg';
    const length = (bytes[i] << 8) | bytes[i + 1];
    if (length < 2 || i + length > bytes.length) return 'photo_not_jpeg';
    if (marker === APP1) return 'photo_has_exif';
    if (isFrame(marker)) {
      if (length < 7) return 'photo_not_jpeg';
      const height = (bytes[i + 3] << 8) | bytes[i + 4];
      const width = (bytes[i + 5] << 8) | bytes[i + 6];
      if (!width || !height) return 'photo_not_jpeg';
      size ??= { width, height };
    }
    i += length;
    if (marker === SOS) {
      if (!size) return 'photo_not_jpeg';
      // The scan's data, to the next marker; 0xFF 0x00 and the restart markers belong to it.
      while (i + 1 < bytes.length) {
        if (bytes[i] === 0xff && bytes[i + 1] !== 0 && !standalone(bytes[i + 1])) break;
        i++;
      }
      if (i + 1 >= bytes.length) return 'photo_not_jpeg';
    }
  }
  return 'photo_not_jpeg';
}

/**
 * Keeps the photos of a message in its thread's folder, each under a new name, and gives the
 * message's parts that name them, or nothing when one could not be kept, after removing those
 * that were. The bucket refuses what is not a JPEG or larger than a photo may be.
 */
export async function storePhotos(
  admin: Client,
  userId: string,
  threadId: number,
  photos: CheckedPhoto[],
): Promise<ChatPhotoPart[] | undefined> {
  const folder = threadMediaFolder(userId, threadId);
  const results = await Promise.all(
    photos.map(async ({ bytes, width, height }): Promise<ChatPhotoPart | undefined> => {
      const path = `${folder}/${crypto.randomUUID()}.jpg`;
      const { error } = await admin.storage
        .from(MEDIA_BUCKET)
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
      if (error) return void logError('Could not keep a photo', error);
      return { type: 'image', path, mimeType: 'image/jpeg', width, height };
    }),
  );
  const stored = results.filter((part) => part !== undefined);
  if (stored.length === photos.length) return stored;
  await removePhotos(admin, stored);
  return undefined;
}

/** Removes kept photos whose message could not be saved, as nothing else would. */
export async function removePhotos(admin: Client, parts: ChatPhotoPart[]): Promise<void> {
  if (!parts.length) return;
  const { error } = await admin.storage.from(MEDIA_BUCKET).remove(parts.map((part) => part.path));
  if (error) logError('Could not remove photos of a message not saved', error);
}
