// The request handling of estimate-meal (#299, ADR 0059), apart from signing in, so that it can be
// tested with stand-ins for the database and the model. Photos of a meal are estimated in one
// model request, and each item is looked up in the food library, whose values it then takes.
import { z } from 'zod';

import { aiModel, AiRefusedError } from '../_shared/ai_usage.ts';
import { Constants, type Database } from '../_shared/database.types.ts';
import { FOOD_QUERY_LENGTH, foodNameKey, type FoodRef } from '../_shared/foods.ts';
import type { LanguageModel, Part } from '../_shared/llm/mod.ts';
import {
  type EstimateFood,
  type EstimateItem,
  type EstimateReason,
  type EstimateRequest as Body,
  type EstimateResponse,
  MAX_ESTIMATE_ITEMS,
  MAX_MEAL_PHOTOS,
  MAX_NOTE_LENGTH,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_BYTES,
  MEAL_PHOTO_TYPES,
  type Per100,
} from '../_shared/meal/estimate.ts';
import { type Language, LANGUAGES } from '../_shared/prompt.ts';
import { type Client, logError } from '../_shared/supabase.ts';
import { ModelOutput, RESPONSE_SCHEMA, requestParts, SYSTEM } from './prompt.ts';

export type EstimateContext = {
  /** A client with the user's token, which starts the call and searches the foods as theirs. */
  supabase: Client;
  /** A client with the service role, which alone records what the call used (ADR 0051). */
  admin: Client;
  /** For tests; the language model by default. */
  model?: LanguageModel;
};

/** Base64 without line breaks, as the app sends it. */
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const Photo = z.object({
  mimeType: z.enum(MEAL_PHOTO_TYPES),
  data: z
    .string()
    .regex(BASE64)
    .refine((data) => data.length % 4 === 0, 'Not base64'),
});

const EstimateRequest = z.object({
  photos: z.array(Photo).min(1).max(MAX_MEAL_PHOTOS),
  language: z.enum(LANGUAGES),
  meal: z.enum(Constants.public.Enums.meal).optional(),
  note: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
  previous: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        grams: z.number().positive().max(5000),
      }),
    )
    .max(MAX_ESTIMATE_ITEMS)
    .optional(),
}) satisfies z.ZodType<Body>;
type EstimateRequest = z.infer<typeof EstimateRequest>;

/**
 * The largest body read, in bytes: the photos at their largest as base64, and room for the rest.
 * A larger one is refused before it is parsed.
 */
const MAX_BODY_BYTES = Math.ceil(MAX_PHOTOS_BYTES / 3) * 4 + 20_000;

type ModelItem = z.infer<typeof ModelOutput>['items'][number];

/** The HTTP status each reason is answered with. */
const STATUS: Record<EstimateReason, number> = {
  invalid_request: 400,
  photos_too_large: 413,
  account_required: 403,
  plan_required: 403,
  limit_reached: 429,
  request_too_large: 413,
  unpriced_model: 503,
  call_in_progress: 409,
  blocked: 422,
  unavailable: 503,
};

export async function handleEstimateRequest(
  req: Request,
  context: EstimateContext,
): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  const length = Number(req.headers.get('content-length'));
  if (length > MAX_BODY_BYTES) return refused('photos_too_large');
  // Counted as it comes, as a request may not say its length, or say less than it sends.
  const text = await readBody(req, MAX_BODY_BYTES);
  if (text === undefined) return refused('photos_too_large');

  const parsed = EstimateRequest.safeParse(parseJson(text));
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_request', issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }
  const request = parsed.data;
  // Too large photos are refused before anything is sent to the model.
  const sizes = request.photos.map((photo) => decodedBytes(photo.data));
  if (sizes.some((size) => size > MAX_PHOTO_BYTES) || sum(sizes) > MAX_PHOTOS_BYTES) {
    return refused('photos_too_large');
  }

  // One request, without history, snapshot or tools, as the estimate needs none (ADR 0059).
  let parts: Part[];
  try {
    const bite = aiModel(
      { supabase: context.supabase, admin: context.admin, model: context.model },
      'meal_photo',
    );
    const response = await bite.generate({
      system: SYSTEM,
      messages: [
        { role: 'user', parts: requestParts({ ...request, note: request.note || undefined }) },
      ],
      responseSchema: RESPONSE_SCHEMA,
    });
    if (response.finish === 'blocked') return refused('blocked');
    if (response.finish === 'length') {
      // A cut answer is not whole JSON; it is said apart from a wrong shape, as the limit may need
      // raising (ai_feature_limits).
      console.error('The estimate was cut at the token limit', { usage: response.usage });
      return refused('unavailable');
    }
    parts = response.parts;
  } catch (error) {
    if (error instanceof AiRefusedError) return refused(error.reason);
    logError('Could not estimate the meal', error);
    return refused('unavailable');
  }

  const output = ModelOutput.safeParse(parseJson(answerText(parts)));
  if (!output.success) {
    console.error('The estimate was not in the shape asked for', {
      issues: output.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.code}`),
    });
    return refused('unavailable');
  }
  const { isFood, items, note } = output.data;
  const estimate: EstimateResponse = {
    isFood,
    items: isFood ? await matchItems(context.supabase, request.language, items) : [],
    ...(note && { note }),
  };
  return Response.json(estimate);
}

/**
 * A food search_foods() found, by exactly one of its ids, which the generated types do not mark as
 * nullable.
 */
type FoundFood = Pick<
  Database['public']['Functions']['search_foods']['Returns'][number],
  'name' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'
> & { food_id: string | null; custom_food_id: number | null; recipe_id: number | null };

/**
 * The items with the values of the food each matched in the library or the user's own foods and
 * recipes, or the model's own, marked as estimated, for an item that matched none. Each name is
 * searched once, as the user, so that only their own foods are found.
 */
async function matchItems(
  supabase: Client,
  language: Language,
  items: ModelItem[],
): Promise<EstimateItem[]> {
  const searches = new Map<string, Promise<FoundFood[]>>();
  const search = (query: string) => {
    if (!searches.has(query)) searches.set(query, searchFoods(supabase, language, query));
    return searches.get(query)!;
  };
  return await Promise.all(
    items.map(async (item) => {
      const food = bestMatch(item.searchName, await search(item.searchName));
      return {
        name: item.name,
        grams: Math.max(1, Math.round(item.grams)),
        confidence: Math.round(item.confidence * 100) / 100,
        ...(food
          ? { food: foodOf(food), per100: per100Of(food), estimated: false }
          : { per100: rounded(item.per100), estimated: true }),
        ...(item.note && { note: item.note }),
      };
    }),
  );
}

/** The foods search_foods() finds, or none when it cannot search; the item is then estimated. */
async function searchFoods(
  supabase: Client,
  language: Language,
  query: string,
): Promise<FoundFood[]> {
  if (query.length < FOOD_QUERY_LENGTH.min || query.length > FOOD_QUERY_LENGTH.max) return [];
  const { data, error } = await supabase.rpc('search_foods', { query, language });
  if (error) {
    logError('Could not search the foods', error);
    return [];
  }
  return data;
}

/**
 * The food an item is, of those search_foods() found, best first: one whose name holds the food
 * searched for, which is the part before a comma, such as "chicken breast" of "Chicken breast,
 * grilled", so that a name that is only alike, as "Egg, boiled" for "boiled rice", is no match.
 * The user's own food or recipe that starts with it comes before the library's.
 */
export function bestMatch(searchName: string, found: FoundFood[]): FoundFood | undefined {
  const food = nameKey(searchName).split(',')[0].trim();
  if (food.length < FOOD_QUERY_LENGTH.min) return undefined;
  const matches = found.filter((row) => nameKey(row.name).includes(food));
  const own = matches.find((row) => row.food_id === null && nameKey(row.name).startsWith(food));
  return own ?? matches[0];
}

/** A name as search_foods() compares it, trimmed. */
function nameKey(name: string): string {
  return foodNameKey(name).trim();
}

/** A found food as a meal entry names it. */
function foodOf(row: FoundFood): EstimateFood {
  const ref: FoodRef =
    row.recipe_id !== null
      ? { kind: 'recipe', id: row.recipe_id }
      : row.custom_food_id !== null
        ? { kind: 'custom', id: row.custom_food_id }
        : { kind: 'library', id: row.food_id! };
  return { ref, name: row.name };
}

function per100Of(row: FoundFood): Per100 {
  return { kcal: row.kcal, proteinG: row.protein_g, carbsG: row.carbs_g, fatG: row.fat_g };
}

/** The model's values, to a tenth, as the library has them. */
function rounded(values: Per100): Per100 {
  const tenth = (value: number) => Math.round(value * 10) / 10;
  return {
    kcal: tenth(values.kcal),
    proteinG: tenth(values.proteinG),
    carbsG: tenth(values.carbsG),
    fatG: tenth(values.fatG),
  };
}

/** The text of the answer, which holds its JSON. */
function answerText(parts: Part[]): string {
  return parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
}

/**
 * The body as text, read until it ends or passes `max` bytes, when reading stops and nothing is
 * given; an empty text for a body that cannot be read.
 */
export async function readBody(req: Request, max: number): Promise<string | undefined> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel().catch(() => {});
        return undefined;
      }
      chunks.push(value);
    }
  } catch {
    return '';
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** How many bytes base64 data holds. */
function decodedBytes(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return (data.length / 4) * 3 - padding;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function refused(reason: EstimateReason): Response {
  return Response.json({ error: reason }, { status: STATUS[reason] });
}
