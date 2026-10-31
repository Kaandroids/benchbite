// A meal estimated from photos (#299, ADR 0059): the photos are taken or chosen, scaled down on
// the device and sent to estimate-meal, which answers with the foods it sees and their values.
import {
  estimateValues,
  type EstimateItem,
  type EstimateMeal,
  type EstimateReason,
  type EstimateResponse,
  type Per100,
  type PreviousItem,
} from '@shared/meal/estimate';

import { REFUSALS, type Refusal } from '@/ai/access';
import { oneOf } from '@/lib/one-of';
import { preparePhoto } from '@/lib/photos';
import { functionHeaders, functionUrl } from '@/lib/supabase';

import type { Totals } from './meals';

export type { EstimateItem, EstimateResponse };

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

/** Values as an estimate gives them, per 100 g or at grams, as the app names them. */
export function per100Totals({ kcal, proteinG, carbsG, fatG }: Per100): Totals {
  return { calories: kcal, proteinG, carbsG, fatG };
}

/** What an item adds at its grams. */
export function itemTotals(item: Pick<EstimateItem, 'per100' | 'grams'>): Totals {
  return estimateTotals([item]);
}

/** What the items add together. */
export function estimateTotals(items: Pick<EstimateItem, 'per100' | 'grams'>[]): Totals {
  return per100Totals(estimateValues(items));
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
