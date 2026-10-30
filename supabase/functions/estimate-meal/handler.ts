// The request handling of estimate-meal (#299, ADR 0059), apart from signing in, so that it can be
// tested with stand-ins for the database and the model. Photos of a meal are estimated in one
// model request, and each item is looked up in the food library, whose values it then takes.
import { z } from 'zod';

import { aiModel, AiRefusedError } from '../_shared/ai_usage.ts';
import { Constants } from '../_shared/database.types.ts';
import type { LanguageModel, Part } from '../_shared/llm/mod.ts';
import {
  type EstimateReason,
  type EstimateRequest as Body,
  type EstimateResponse,
  MAX_ESTIMATE_ITEMS,
  MAX_MEAL_PHOTOS,
  MAX_NOTE_LENGTH,
  MEAL_PHOTO_TYPES,
} from '../_shared/meal/estimate.ts';
import { matchItems } from '../_shared/meal/match.ts';
import { BASE64, decodedBytes, photosBodyBytes, photosFit } from '../_shared/photos.ts';
import { LANGUAGES } from '../_shared/prompt.ts';
import { parseJson, readBody } from '../_shared/request.ts';
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
const MAX_BODY_BYTES = photosBodyBytes(20_000);

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
  if (!photosFit(request.photos.map((photo) => decodedBytes(photo.data)))) {
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

/** The text of the answer, which holds its JSON. */
function answerText(parts: Part[]): string {
  return parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
}

function refused(reason: EstimateReason): Response {
  return Response.json({ error: reason }, { status: STATUS[reason] });
}
