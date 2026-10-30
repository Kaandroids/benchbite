// What the app and estimate-meal tell each other (#299, ADR 0059), shared by both, so that they
// agree. This file imports nothing, so that the app can bundle it.

/** The kinds of photo the function takes; the app scales them down before it sends them. */
export const MEAL_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type MealPhotoType = (typeof MEAL_PHOTO_TYPES)[number];

/** How many photos of the same meal one estimate takes. */
export const MAX_MEAL_PHOTOS = 3;

/** The largest photo, decoded, in bytes. */
export const MAX_PHOTO_BYTES = 1_500_000;

/** All photos of an estimate together, decoded, in bytes. */
export const MAX_PHOTOS_BYTES = 3_000_000;

/** The longest correction the user may write, in characters. */
export const MAX_NOTE_LENGTH = 300;

/** The most items an estimate gives, or a correction sends back. */
export const MAX_ESTIMATE_ITEMS = 12;

/** A photo, as base64 data in the request itself. */
export type MealPhoto = { mimeType: MealPhotoType; data: string };

/** A meal of the day, as meal entries name it. */
export type EstimateMeal = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** An item of an earlier estimate, sent back with a correction. */
export type PreviousItem = { name: string; grams: number };

/** Photos of a meal to estimate, or to estimate again with the user's correction. */
export type EstimateRequest = {
  /** One to `MAX_MEAL_PHOTOS` photos of the same meal. */
  photos: MealPhoto[];
  /** The app's language, which names and Bite's note are in. */
  language: string;
  meal?: EstimateMeal;
  /** What the user says is wrong with the last estimate, such as "the rice was half a portion". */
  note?: string;
  /** The items of the last estimate, which the note corrects; extra fields are ignored. */
  previous?: PreviousItem[];
};

/**
 * The food an item was matched to, as a meal entry names it (`food_id`, `custom_food_id` or
 * `recipe_id`), with its name in the library or as the user named it.
 */
export type EstimateFood =
  | { kind: 'library'; id: string; name: string }
  | { kind: 'custom'; id: number; name: string }
  | { kind: 'recipe'; id: number; name: string };

/** Calories and macros per 100 g. */
export type Per100 = { kcal: number; proteinG: number; carbsG: number; fatG: number };

/** A food seen in the photos, and how much of it. */
export type EstimateItem = {
  /** What the item is, in the user's language. */
  name: string;
  /** The amount seen, in whole grams. */
  grams: number;
  /** How sure the estimate is, from 0 to 1. */
  confidence: number;
  /** The food of the library or of the user's own it was matched to; none when `estimated`. */
  food?: EstimateFood;
  /** The matched food's values, or the model's estimate when it matched none. */
  per100: Per100;
  /** True when no food matched and `per100` is the model's estimate. */
  estimated: boolean;
  /** What is uncertain about it, such as how much oil, in the user's language. */
  note?: string;
};

/**
 * An estimate: the items seen, with `isFood` false and no items for a photo of no food, and
 * Bite's short line about it, in the user's language.
 */
export type EstimateResponse = { isFood: boolean; items: EstimateItem[]; note?: string };

/**
 * Why there is no estimate: `invalid_request` for a request the function does not take,
 * `photos_too_large` for photos over the limits, the reasons of `ai_access()` and
 * `start_ai_call()`, `blocked` by the model's safety rules, and `unavailable` for any failure,
 * an answer the function cannot read included.
 */
export type EstimateReason =
  | 'invalid_request'
  | 'photos_too_large'
  | 'account_required'
  | 'plan_required'
  | 'limit_reached'
  | 'request_too_large'
  | 'unpriced_model'
  | 'call_in_progress'
  | 'blocked'
  | 'unavailable';

export type EstimateError = { error: EstimateReason };
