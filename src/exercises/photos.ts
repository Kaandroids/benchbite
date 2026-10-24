// Photos of the user's own exercises, the start and the end of a rep (ADR 0027). They are taken
// or chosen on the device, shrunk, uploaded to the user's folder of the private exercise-photos
// bucket, and shown through signed URLs.
import { useQuery } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
} from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

import { exerciseImageUrl } from './images';

const BUCKET = 'exercise-photos';
const MAX_WIDTH = 1080;
/** A signed URL lasts an hour; it is asked for again a little before it runs out. */
const SIGNED_SECONDS = 3600;

/** Whether a picture is a user's photo rather than one of the library, which starts with its id. */
export function isUserPhoto(path: string): boolean {
  return /^[0-9a-f-]{36}\//.test(path);
}

/**
 * Takes a photo with the camera or chooses one from the library, square as the app shows them.
 * Resolves to its local URI, or null when cancelled or not allowed.
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<string | null> {
  const options = {
    mediaTypes: ['images' as const],
    allowsEditing: true,
    aspect: [1, 1] as [1, 1],
  };
  if (source === 'camera') {
    const permission = await requestCameraPermissionsAsync();
    if (!permission.granted) {
      return null;
    }
  }
  const result =
    source === 'camera' ? await launchCameraAsync(options) : await launchImageLibraryAsync(options);
  return result.canceled ? null : (result.assets[0]?.uri ?? null);
}

/**
 * A local photo as a JPEG at most MAX_WIDTH wide, small enough to upload, as bytes. They come as
 * base64, as fetching a local file for its bytes is not reliable in React Native.
 */
async function shrink(uri: string): Promise<Uint8Array> {
  const context = ImageManipulator.manipulate(uri);
  const image = await context.renderAsync();
  const resized =
    image.width > MAX_WIDTH
      ? await ImageManipulator.manipulate(uri).resize({ width: MAX_WIDTH }).renderAsync()
      : image;
  const saved = await resized.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  const binary = atob(saved.base64 ?? '');
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Shrinks a local photo and uploads it to the user's folder. Resolves to its path. */
export async function uploadPhoto(uri: string): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) {
    throw new Error('Not signed in');
  }
  const body = await shrink(uri);
  const path = `${userId}/${randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType: 'image/jpeg' });
  if (error) {
    throw error;
  }
  return path;
}

/** Removes photos the user no longer uses. */
export async function removePhotos(paths: string[]) {
  if (paths.length === 0) {
    return;
  }
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) {
    throw error;
  }
}

/**
 * The URLs to show pictures by: library pictures as they are, the user's photos signed. Pictures
 * waiting for their signed URL are missing until it arrives.
 */
export function usePictureUrls(paths: readonly string[]): Record<string, string> {
  const photos = paths.filter(isUserPhoto);
  const signed = useQuery({
    queryKey: ['exercise-photos', ...photos],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(photos, SIGNED_SECONDS);
      if (error) {
        throw error;
      }
      return Object.fromEntries(
        data.flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl]] : [])),
      );
    },
    enabled: photos.length > 0,
    staleTime: (SIGNED_SECONDS - 600) * 1000,
  });
  return Object.fromEntries(
    paths.flatMap((path) => {
      const url = isUserPhoto(path) ? signed.data?.[path] : exerciseImageUrl(path);
      return url ? [[path, url]] : [];
    }),
  );
}
