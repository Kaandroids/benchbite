// The limits of the photos the app sends to a function, a meal photo in Nutrition (ADR 0059) or a
// photo in Bite's chat (ADR 0062), shared so that both take the same photos. This file imports
// nothing, so that the app can bundle it.

/** How many photos one request takes. */
export const MAX_PHOTOS = 3;

/** The largest photo, decoded, in bytes. */
export const MAX_PHOTO_BYTES = 1_500_000;

/** All photos of a request together, decoded, in bytes. */
export const MAX_PHOTOS_BYTES = 3_000_000;

/**
 * The largest body a function reads with photos in it, in bytes: the photos at their largest as
 * base64, and `rest` for everything else. A larger one is refused before it is parsed.
 */
export function photosBodyBytes(rest: number): number {
  return Math.ceil(MAX_PHOTOS_BYTES / 3) * 4 + rest;
}

/** How many bytes base64 data holds. */
export function decodedBytes(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return (data.length / 4) * 3 - padding;
}

/** Whether photos, as base64 data, are within the limits, decoded, each and together. */
export function photosFit(photos: { data: string }[]): boolean {
  const sizes = photos.map((photo) => decodedBytes(photo.data));
  return (
    sizes.every((size) => size <= MAX_PHOTO_BYTES) &&
    sizes.reduce((total, size) => total + size, 0) <= MAX_PHOTOS_BYTES
  );
}
