// Photos the user takes or chooses to send to a function: a meal's in Nutrition (ADR 0059), or
// those of a message to Bite (ADR 0062). Each caller says how many it takes; all are scaled down
// on the device the same way, and deleted from the app's cache once read.
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
} from 'expo-image-picker';

/**
 * The longest side of a photo as it is sent, and its JPEG quality: about 100 to 200 KB, far below
 * the 1.5 MB a function takes per photo, and enough to tell foods and portions apart.
 */
const PHOTO_SIDE = 1024;
const PHOTO_QUALITY = 0.7;

/** Where photos come from. */
export type PhotoSource = 'camera' | 'library';

/** A photo ready to send: a JPEG, as base64. */
export type PreparedPhoto = { mimeType: 'image/jpeg'; data: string };

/**
 * Takes a photo with the camera, or chooses up to `limit` from the library. Resolves to their
 * local URIs, or none when cancelled or the camera is not allowed.
 */
export async function pickPhotos(source: PhotoSource, limit: number): Promise<string[]> {
  if (source === 'camera') {
    const permission = await requestCameraPermissionsAsync();
    if (!permission.granted) {
      return [];
    }
  }
  const result =
    source === 'camera'
      ? await launchCameraAsync({ mediaTypes: ['images'] })
      : await launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsMultipleSelection: limit > 1,
          selectionLimit: limit,
        });
  return result.canceled ? [] : result.assets.slice(0, limit).map(({ uri }) => uri);
}

/**
 * A local photo as a JPEG at most `PHOTO_SIDE` on its longest side, as base64. The scaled copy is
 * deleted once it is read.
 */
export async function preparePhoto(uri: string): Promise<PreparedPhoto> {
  // Decoded at the smaller size already, which keeps a large camera photo out of memory.
  const image = await ImageManipulator.manipulate(uri, {
    maxWidth: PHOTO_SIDE,
    maxHeight: PHOTO_SIDE,
  }).renderAsync();
  const saved = await image.saveAsync({
    format: SaveFormat.JPEG,
    compress: PHOTO_QUALITY,
    base64: true,
  });
  discardPhotos([saved.uri]);
  if (!saved.base64) {
    throw new Error('The scaled photo came without its data');
  }
  return { mimeType: 'image/jpeg', data: saved.base64 };
}

/**
 * Deletes photos the app keeps in its cache folder: the camera's, the copies the picker makes and
 * the scaled ones. A photo anywhere else, or one already gone, is left alone.
 */
export function discardPhotos(uris: string[]) {
  // Deleting is tidying up: it never fails what it follows.
  try {
    const cache = Paths.cache.uri;
    for (const uri of uris.filter((photo) => photo.startsWith(cache))) {
      const file = new File(uri);
      if (file.exists) file.delete();
    }
  } catch (error) {
    console.warn('Could not delete the photos', error);
  }
}
