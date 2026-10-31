// The photos of a message to Bite (#299, ADR 0062): checked before anything is sent or kept, and
// kept in `coach-media` with the service role once their turn is saved.
import { decodeBase64 } from '../_shared/base64.ts';
import { MEDIA_BUCKET, threadMediaFolder } from '../_shared/coach/media.ts';
import type { ChatPhotoPart, PhotoRefusal } from '../_shared/coach/chat.ts';
import { EOI, isFrame, segments, SOS } from '../_shared/jpeg_metadata.ts';
import { photosFit } from '../_shared/photos.ts';
import { type Client, logError } from '../_shared/supabase.ts';

/** A photo that passed the checks: its bytes to keep, its base64 data for the model, its size. */
export type CheckedPhoto = { bytes: Uint8Array; data: string; width: number; height: number };

/** Why a message's photos are refused, and which one, when one of them is. */
export type PhotosRefusal =
  { reason: 'photos_too_large' } | { reason: PhotoRefusal; photo: number };

/**
 * Checks a message's photos, as base64 data, before anything is sent or kept (ADR 0062): within
 * the limits together, then each a whole JPEG without Exif data. Gives them with their bytes and
 * size, or why they are refused.
 */
export function checkPhotos(photos: { data: string }[]): CheckedPhoto[] | PhotosRefusal {
  if (!photosFit(photos)) return { reason: 'photos_too_large' };
  const checked: CheckedPhoto[] = [];
  for (const [index, { data }] of photos.entries()) {
    const bytes = decodeBase64(data);
    const read = readJpeg(bytes);
    if (typeof read === 'string') return { reason: read, photo: index };
    checked.push({ bytes, data, ...read });
  }
  return checked;
}

/**
 * Reads a JPEG's segments to its end, and gives its size, or why it is refused: not a JPEG, with
 * anything after its end or a segment the standard does not define, or with any metadata segment
 * but the three kept, wherever it is, as Exif data is refused, not removed (ADR 0062). The app
 * keeps only those segments before it sends a photo, as re-encoding alone can leave a small Exif
 * segment on iOS (ADR 0065).
 */
export function readJpeg(bytes: Uint8Array): { width: number; height: number } | PhotoRefusal {
  let size: { width: number; height: number } | undefined;
  for (const segment of segments(bytes)) {
    if (!segment) return 'photo_not_jpeg';
    const { marker, start, end, metadata } = segment;
    if (marker === EOI) {
      // Nothing may follow the end, as other images and their Exif data can.
      return size && end === bytes.length ? size : 'photo_not_jpeg';
    }
    if (metadata) return 'photo_has_exif';
    if (isFrame(marker)) {
      // The frame's length, at its start, then its precision, height and width.
      if (end - start < 9) return 'photo_not_jpeg';
      const height = (bytes[start + 5] << 8) | bytes[start + 6];
      const width = (bytes[start + 7] << 8) | bytes[start + 8];
      if (!width || !height) return 'photo_not_jpeg';
      size ??= { width, height };
    }
    if (marker === SOS && !size) return 'photo_not_jpeg';
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
