// A meal estimated from photos (#299, ADR 0059): the photos are taken or chosen, scaled down on
// the device and sent to estimate-meal, which answers with the foods it sees and their values.
import {
  MAX_MEAL_PHOTOS,
  type EstimateItem,
  type EstimateMeal,
  type EstimateReason,
  type EstimateResponse,
  type MealPhoto,
  type Per100,
  type PreviousItem,
} from '@shared/meal/estimate';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
} from 'expo-image-picker';

import { REFUSALS, type Refusal } from '@/ai/access';
import { oneOf } from '@/lib/one-of';
import { functionHeaders, functionUrl } from '@/lib/supabase';

import { amountOf } from './foods';
import { totalOf, type Totals } from './meals';

export type { EstimateItem, EstimateResponse };

/**
 * The longest side of a photo as it is sent, and its JPEG quality: about 100 to 200 KB, far
 * below estimate-meal's 1.5 MB per photo, and enough to tell foods and portions apart.
 */
const PHOTO_SIDE = 1024;
const PHOTO_QUALITY = 0.7;

/** Where the photos of a meal come from. */
export type PhotoSource = 'camera' | 'library';

/**
 * Takes a photo with the camera, or chooses up to `MAX_MEAL_PHOTOS` from the library. Resolves to
 * their local URIs, or none when cancelled or the camera is not allowed.
 */
export async function pickMealPhotos(source: PhotoSource): Promise<string[]> {
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
          allowsMultipleSelection: true,
          selectionLimit: MAX_MEAL_PHOTOS,
        });
  return result.canceled ? [] : result.assets.slice(0, MAX_MEAL_PHOTOS).map(({ uri }) => uri);
}

/**
 * A local photo as a JPEG at most `PHOTO_SIDE` on its longest side, as base64. The scaled copy is
 * deleted once it is read.
 */
async function preparePhoto(uri: string): Promise<MealPhoto> {
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
 * Deletes photos of a meal the app keeps in its cache folder: the camera's, the copies the picker
 * makes and the scaled ones. A photo anywhere else, or one already gone, is left alone.
 */
export function discardPhotos(uris: string[]) {
  for (const uri of uris) {
    if (!uri.startsWith(Paths.cache.uri)) continue;
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch (error) {
      console.warn('Could not delete a meal photo', error);
    }
  }
}

/**
 * Why there is no estimate, as estimate-meal answered, or `unavailable` when it did not; with the
 * HTTP status and what else the function said, for the log.
 */
export class EstimateFailure extends Error {
  constructor(
    readonly reason: EstimateReason,
    readonly status?: number,
    readonly detail?: unknown,
  ) {
    super(`estimate-meal failed: ${reason}${status ? ` (${status})` : ''}`);
    this.name = 'EstimateFailure';
  }

  /** Why the user may not use AI now, which the app tells as Bite does, if it is that. */
  get refusal(): Refusal | undefined {
    return oneOf(REFUSALS, this.reason);
  }
}

/** What the user says is off with an estimate, and its items as they stand. */
export type Correction = { note: string; previous: PreviousItem[] };

export type EstimateInput = {
  /** The local URIs of the photos. */
  photos: string[];
  language: string;
  meal: EstimateMeal;
  /** For an estimate again. */
  correction?: Correction;
};

/**
 * Estimates a meal from its photos, with the user's token, as Bite's chat is called. Fails with
 * an `EstimateFailure` for an answer that is no estimate, with the error of preparing the photos
 * or of the request otherwise, and with an `AbortError` when `signal` stops it.
 */
export async function estimateMeal(
  { photos, language, meal, correction }: EstimateInput,
  signal?: AbortSignal,
): Promise<EstimateResponse> {
  const prepared = await Promise.all(photos.map(preparePhoto));
  signal?.throwIfAborted();
  const response = await fetch(functionUrl('estimate-meal'), {
    method: 'POST',
    headers: await functionHeaders(),
    body: JSON.stringify({ photos: prepared, language, meal, ...correction }),
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || typeof body !== 'object' || body === null || !('isFood' in body)) {
    const reason = (body as { error?: unknown } | null)?.error;
    throw new EstimateFailure(
      typeof reason === 'string' ? (reason as EstimateReason) : 'unavailable',
      response.status,
      body,
    );
  }
  return body as EstimateResponse;
}

/** Values per 100 g as an estimate gives them, as the app names them. */
export function per100Totals({ kcal, proteinG, carbsG, fatG }: Per100): Totals {
  return { calories: kcal, proteinG, carbsG, fatG };
}

/** What an item adds at its grams. */
export function itemTotals(item: Pick<EstimateItem, 'per100' | 'grams'>): Totals {
  return amountOf(per100Totals(item.per100), item.grams);
}

/** What the items add together. */
export function estimateTotals(items: Pick<EstimateItem, 'per100' | 'grams'>[]): Totals {
  return totalOf(items.map(itemTotals));
}

export type Confidence = 'high' | 'medium' | 'low';

/**
 * How sure the estimate is as a whole: the items' confidence, each weighed by its calories, so
 * that an unsure garnish does not lower a plate Bite is sure of.
 */
export function confidenceOf(
  items: Pick<EstimateItem, 'per100' | 'grams' | 'confidence'>[],
): Confidence {
  const weights = items.map((item) => Math.max(itemTotals(item).calories, 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const value =
    total === 0
      ? 0
      : items.reduce((sum, item, index) => sum + item.confidence * weights[index]!, 0) / total;
  return value >= 0.75 ? 'high' : value >= 0.5 ? 'medium' : 'low';
}
