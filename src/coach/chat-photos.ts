// The photos of messages to Bite (#299, ADR 0062): prepared on the device to be sent, and read back
// from `coach-media` when a chat is opened again.
import { fromBase64, toBase64 } from '@shared/base64_bytes';
import type { ChatPhoto, ChatPhotoPart, PHOTO_REFUSALS } from '@shared/coach/chat';
import { MEDIA_BUCKET } from '@shared/coach/media';
import { withoutMetadata } from '@shared/jpeg_metadata';
import { photosFit } from '@shared/photos';
import { useQuery } from '@tanstack/react-query';

import type { Json } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { discardPhotos, preparePhoto } from '@/lib/photos';

/**
 * A photo of a message: one the user sends now, shown from the device, with its data to send it
 * again; or one kept with a chat, by its path in `coach-media`.
 */
export type MessagePhoto = { data: string; path?: never } | { path: string; data?: never };

/** Why the photos of a message were refused, and which one, counted from 0, when it is one. */
export type PhotosProblem = {
  reason: (typeof PHOTO_REFUSALS)[number] | 'photo_not_prepared';
  photo?: number;
};

/** The address a photo sent now is shown from: its data itself, as it is not kept on the device. */
export function photoDataUri(data: string): string {
  return `data:image/jpeg;base64,${data}`;
}

/**
 * A photo taken or chosen, ready to send to Bite: scaled down and re-encoded as every photo sent
 * is, by preparePhoto(), then without any metadata segment (ADR 0065), so that neither the place
 * nor the time it was taken leaves the device. The photo on the device is deleted once it is
 * read. Fails for a photo that cannot be read.
 */
export async function prepareChatPhoto(uri: string): Promise<string> {
  try {
    const { data } = await preparePhoto(uri);
    const stripped = withoutMetadata(fromBase64(data));
    if (!stripped) throw new Error('The scaled photo is not a JPEG that can be sent');
    return toBase64(stripped);
  } finally {
    discardPhotos([uri]);
  }
}

/** What a message's photos are sent as, or why they cannot be, before they are. */
export function photosToSend(photos: string[]): ChatPhoto[] | PhotosProblem {
  const sent = photos.map((data): ChatPhoto => ({ mimeType: 'image/jpeg', data }));
  return photosFit(sent) ? sent : { reason: 'photos_too_large' };
}

/** The device's local time, HH:MM, which Bite knows the time of day by. */
export function localTime(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** The photos a stored message keeps, by their paths in `coach-media`, in order. */
export function messagePhotos(content: Json): MessagePhoto[] {
  const parts = Array.isArray(content) ? content : [];
  return parts.flatMap((part) => {
    if (!part || typeof part !== 'object' || Array.isArray(part)) return [];
    const { type, path } = part as Partial<ChatPhotoPart>;
    return type === 'image' && typeof path === 'string' ? [{ path }] : [];
  });
}

/** How long a photo's address lasts, and how long before its end a new one is asked for. */
const SIGNED_SECONDS = 60 * 60;
const RENEW_BEFORE_MS = 5 * 60 * 1000;

/**
 * The addresses of photos read back, by path, each with when it ends. Kept for as long as the app
 * runs, so that a chat opened again shows its photos at the same address, which the image cache
 * keeps them by, rather than loading them again.
 */
const signed = new Map<string, { url: string; endsAt: number }>();

/** Forgets the addresses kept, for tests. */
export function forgetPhotoUrls() {
  signed.clear();
}

/**
 * Short-lived addresses of a chat's photos in `coach-media`, by path, which the user may read
 * under the bucket's policies (ADR 0062). Those not known yet, or about to end, are asked for in
 * one request for the whole chat.
 */
export async function photoUrls(paths: string[]): Promise<Map<string, string>> {
  const now = Date.now();
  const wanted = [...new Set(paths)].filter(
    (path) => (signed.get(path)?.endsAt ?? 0) - RENEW_BEFORE_MS <= now,
  );
  if (wanted.length > 0) {
    const { data, error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrls(wanted, SIGNED_SECONDS);
    if (error) throw error;
    for (const { path, signedUrl } of data) {
      if (path && signedUrl)
        signed.set(path, { url: signedUrl, endsAt: now + SIGNED_SECONDS * 1000 });
    }
  }
  const urls = new Map<string, string>();
  for (const path of paths) {
    const url = signed.get(path)?.url;
    if (url) urls.set(path, url);
  }
  return urls;
}

/** The addresses of the photos a chat keeps, read once for the chat when it opens. */
export function usePhotoUrls(threadId: number | undefined, paths: string[]) {
  return useQuery({
    queryKey: ['coach-media', threadId, paths],
    enabled: paths.length > 0,
    queryFn: () => photoUrls(paths),
    // Asked for again before they end, as a chat may stay open.
    staleTime: (SIGNED_SECONDS * 1000) / 2,
    refetchInterval: (SIGNED_SECONDS * 1000) / 2,
  });
}
