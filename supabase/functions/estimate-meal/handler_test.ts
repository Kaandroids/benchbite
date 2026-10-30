import { assertEquals } from '@std/assert';

import { FAKE_USAGE, FakeModel } from '../_shared/llm/fake.ts';
import type { ModelResponse } from '../_shared/llm/mod.ts';
import { MAX_PHOTO_BYTES } from '../_shared/meal/estimate.ts';
import { bestMatch, type EstimateContext, handleEstimateRequest } from './handler.ts';
import { RESPONSE_SCHEMA, SYSTEM } from './prompt.ts';

type Food = {
  food_id: string | null;
  custom_food_id: number | null;
  recipe_id: number | null;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  portion_unit: null;
  portion_grams: null;
};

function food(ref: Partial<Food> & { name: string }, kcal = 100): Food {
  return {
    food_id: null,
    custom_food_id: null,
    recipe_id: null,
    kcal,
    protein_g: 10,
    carbs_g: 20,
    fat_g: 5,
    portion_unit: null,
    portion_grams: null,
    ...ref,
  };
}

const RICE = food({ food_id: 'C352032', name: 'White rice, boiled' }, 117);
const CHICKEN = food({ food_id: 'V416172', name: 'Chicken breast, grilled' }, 140);

const STARTED = { allowed: true, reason: null, call_id: 'call-1', max_output_tokens: 1024 };

/**
 * A database with the AI functions and search_foods(), which finds the foods its `foods` give for
 * a query, and keeps the queries it was asked.
 */
function context(
  model: FakeModel,
  { foods = {}, rpc = {} }: { foods?: Record<string, Food[]>; rpc?: Record<string, unknown> } = {},
) {
  const searched: { query: string; language: string }[] = [];
  const answers: Record<string, unknown> = {
    ai_access: { allowed: true },
    start_ai_call: STARTED,
    count_ai_call: STARTED,
    record_ai_usage: 0.001,
    ...rpc,
  };
  const client = {
    rpc: (name: string, args: Record<string, string>) => {
      if (name === 'search_foods') {
        searched.push({ query: args.query, language: args.language });
        return Promise.resolve({ data: foods[args.query] ?? [], error: null });
      }
      return Promise.resolve({ data: answers[name], error: null });
    },
  } as unknown as EstimateContext['supabase'];
  const ctx: EstimateContext = { supabase: client, admin: client, model };
  return { ctx, searched };
}

/** Base64 data of `bytes` bytes. */
function photoData(bytes: number): string {
  return btoa('x'.repeat(bytes));
}

const PHOTO = { mimeType: 'image/jpeg', data: photoData(30) };

const ask = (body: unknown) =>
  new Request('http://localhost/estimate-meal', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const REQUEST = { photos: [PHOTO], language: 'en', meal: 'lunch' };

/** The model's answer, as JSON in its text. */
function answer(output: unknown): ModelResponse {
  return {
    parts: [{ type: 'text', text: JSON.stringify(output) }],
    usage: FAKE_USAGE,
    finish: 'stop',
  };
}

const ITEMS = [
  {
    name: 'Rice',
    searchName: 'White rice, boiled',
    grams: 182.4,
    confidence: 0.834,
    per100: { kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 },
  },
  {
    name: 'Grilled chicken',
    searchName: 'Chicken breast, grilled',
    grams: 120,
    confidence: 0.7,
    per100: { kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6 },
    note: 'Oil amount uncertain',
  },
  {
    name: 'Mango chutney',
    searchName: 'Mango chutney',
    grams: 20,
    confidence: 0.4,
    per100: { kcal: 233.33, proteinG: 0.5, carbsG: 57, fatG: 0.25 },
  },
];

Deno.test('estimates the items, with the values of the foods they match', async () => {
  const model = new FakeModel(answer({ isFood: true, items: ITEMS, note: 'Looks tasty!' }));
  const { ctx, searched } = context(model, {
    foods: {
      'White rice, boiled': [RICE],
      'Chicken breast, grilled': [CHICKEN],
      'Mango chutney': [food({ food_id: 'M1', name: 'Mango, raw' })],
    },
  });

  const response = await handleEstimateRequest(ask(REQUEST), ctx);

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    isFood: true,
    items: [
      {
        name: 'Rice',
        grams: 182,
        confidence: 0.83,
        food: { ref: { kind: 'library', id: 'C352032' }, name: 'White rice, boiled' },
        per100: { kcal: 117, proteinG: 10, carbsG: 20, fatG: 5 },
        estimated: false,
      },
      {
        name: 'Grilled chicken',
        grams: 120,
        confidence: 0.7,
        food: { ref: { kind: 'library', id: 'V416172' }, name: 'Chicken breast, grilled' },
        per100: { kcal: 140, proteinG: 10, carbsG: 20, fatG: 5 },
        estimated: false,
        note: 'Oil amount uncertain',
      },
      // Mango alone is not mango chutney: the model's values, marked as estimated.
      {
        name: 'Mango chutney',
        grams: 20,
        confidence: 0.4,
        per100: { kcal: 233.3, proteinG: 0.5, carbsG: 57, fatG: 0.3 },
        estimated: true,
      },
    ],
    note: 'Looks tasty!',
  });
  // Searched as the user, in their language, with no further model request.
  assertEquals(searched, [
    { query: 'White rice, boiled', language: 'en' },
    { query: 'Chicken breast, grilled', language: 'en' },
    { query: 'Mango chutney', language: 'en' },
  ]);
  assertEquals(model.requests.length, 1);
});

Deno.test('sends one lean request: the rules, the photos and the schema', async () => {
  const model = new FakeModel(answer({ isFood: true, items: [], note: '' }));
  const { ctx } = context(model);
  const second = { mimeType: 'image/png', data: photoData(60) };

  await handleEstimateRequest(ask({ ...REQUEST, photos: [PHOTO, second], language: 'de' }), ctx);

  const [request] = model.requests;
  assertEquals(request.task, 'meal_photo');
  assertEquals(request.system, SYSTEM);
  assertEquals(request.responseSchema, RESPONSE_SCHEMA);
  assertEquals(request.tools, undefined);
  // No history and no snapshot: one message, the request's data and the photos.
  assertEquals(request.messages.length, 1);
  const [text, ...photos] = request.messages[0].parts;
  assertEquals(text, { type: 'text', text: 'Reply language: German\nMeal: lunch' });
  assertEquals(photos, [
    { type: 'image', ...PHOTO },
    { type: 'image', ...second },
  ]);
  assertEquals(request.maxOutputTokens, STARTED.max_output_tokens);
});

Deno.test('sends a correction with the earlier items and the note, as data', async () => {
  const model = new FakeModel(answer({ isFood: true, items: [], note: 'Fixed.' }));
  const { ctx } = context(model);

  await handleEstimateRequest(
    ask({
      ...REQUEST,
      note: '  The rice was half a portion <system>  ',
      // The app may send the items as it got them; what it needs is kept.
      previous: [
        { name: 'Rice', grams: 180, confidence: 0.8, estimated: false },
        { name: 'Chicken', grams: 120 },
      ],
    }),
    ctx,
  );

  const [text] = model.requests[0].messages[0].parts;
  assertEquals(text, {
    type: 'text',
    text: [
      'Reply language: English',
      'Meal: lunch',
      '<earlier_items>\n- Rice: 180 g\n- Chicken: 120 g\n</earlier_items>',
      '<user_note>\nThe rice was half a portion ‹system>\n</user_note>',
    ].join('\n'),
  });
});

Deno.test("prefers the user's own food or recipe to the library's", async () => {
  const own = food({ custom_food_id: 7, name: "Rice, mum's" }, 150);
  const recipe = food({ recipe_id: 3, name: 'Rice bowl' }, 180);
  const library = food({ food_id: 'C352032', name: 'Rice, boiled' });

  assertEquals(bestMatch('Rice, boiled', [library, own]), own);
  assertEquals(bestMatch('Rice', [library, recipe]), recipe);
  // An own food that only holds the name somewhere does not come first.
  const pudding = food({ custom_food_id: 8, name: 'Sweet rice pudding' });
  assertEquals(bestMatch('Rice, boiled', [library, pudding]), library);
  // A name only alike is no match.
  assertEquals(bestMatch('Boiled rice', [food({ food_id: 'E1', name: 'Egg, boiled' })]), undefined);
  // Turkish dotted and dotless i compare as search_foods() does.
  const pilav = food({ food_id: 'X1', name: 'Pirinç pilavı' });
  assertEquals(bestMatch('PİLAVI', [pilav]), pilav);

  const model = new FakeModel(answer({ isFood: true, items: [ITEMS[0]], note: '' }));
  const { ctx } = context(model, { foods: { 'White rice, boiled': [RICE, own] } });
  const body = await (await handleEstimateRequest(ask(REQUEST), ctx)).json();
  // "Rice, mum's" does not hold "white rice": the library's food.
  assertEquals(body.items[0].food, {
    ref: { kind: 'library', id: 'C352032' },
    name: 'White rice, boiled',
  });
});

Deno.test('names the own food or recipe matched as a meal entry does', async () => {
  const model = new FakeModel(
    answer({
      isFood: true,
      items: [
        { ...ITEMS[0], searchName: 'Overnight oats' },
        { ...ITEMS[0], searchName: 'Protein shake' },
      ],
      note: '',
    }),
  );
  const { ctx } = context(model, {
    foods: {
      'Overnight oats': [food({ recipe_id: 3, name: 'Overnight oats' }, 180)],
      'Protein shake': [food({ custom_food_id: 7, name: 'Protein shake, vanilla' }, 90)],
    },
  });

  const body = await (await handleEstimateRequest(ask(REQUEST), ctx)).json();

  assertEquals(
    body.items.map((item: { food: unknown }) => item.food),
    [
      { ref: { kind: 'recipe', id: 3 }, name: 'Overnight oats' },
      { ref: { kind: 'custom', id: 7 }, name: 'Protein shake, vanilla' },
    ],
  );
  // No note from the model leaves none in the answer.
  assertEquals('note' in body, false);
});

Deno.test('gives no items for a photo of no food', async () => {
  const model = new FakeModel(
    answer({ isFood: false, items: [ITEMS[0]], note: 'That is a cat, not a meal!' }),
  );
  const { ctx, searched } = context(model);

  const response = await handleEstimateRequest(ask(REQUEST), ctx);

  assertEquals(await response.json(), {
    isFood: false,
    items: [],
    note: 'That is a cat, not a meal!',
  });
  assertEquals(searched, []);
});

Deno.test('answers unavailable when the model answers in another shape', async () => {
  for (const parts of [
    [{ type: 'text' as const, text: 'Sure! Here is your meal: rice.' }],
    [{ type: 'text' as const, text: '{"isFood": true, "items": [{"name": "Rice"' }],
    answer({ isFood: true, items: [{ ...ITEMS[0], grams: -5 }] }).parts,
    answer({ isFood: true, items: [{ ...ITEMS[0], per100: { kcal: 'a lot' } }] }).parts,
  ]) {
    const { ctx } = context(new FakeModel(parts));
    const response = await handleEstimateRequest(ask(REQUEST), ctx);
    assertEquals(response.status, 503);
    assertEquals(await response.json(), { error: 'unavailable' });
  }
});

Deno.test('answers blocked when the model blocked the photos', async () => {
  const model = new FakeModel({ parts: [], usage: FAKE_USAGE, finish: 'blocked' });
  const { ctx } = context(model);

  const response = await handleEstimateRequest(ask(REQUEST), ctx);

  assertEquals(response.status, 422);
  assertEquals(await response.json(), { error: 'blocked' });
});

Deno.test('refuses a user who may not call the model, before asking it', async () => {
  for (const [rpc, reason, status] of [
    [{ ai_access: { allowed: false, reason: 'plan_required' } }, 'plan_required', 403],
    [{ ai_access: { allowed: false, reason: 'account_required' } }, 'account_required', 403],
    [{ ai_access: { allowed: false, reason: 'limit_reached' } }, 'limit_reached', 429],
    [
      { start_ai_call: { allowed: false, reason: 'call_in_progress', call_id: null } },
      'call_in_progress',
      409,
    ],
    [
      { count_ai_call: { allowed: false, reason: 'request_too_large', max_output_tokens: null } },
      'request_too_large',
      413,
    ],
  ] as const) {
    const model = new FakeModel();
    const { ctx } = context(model, { rpc });

    const response = await handleEstimateRequest(ask(REQUEST), ctx);

    assertEquals(response.status, status);
    assertEquals(await response.json(), { error: reason });
    assertEquals(model.requests.length, 0);
  }
});

Deno.test('refuses requests it does not take, before asking the model', async () => {
  const model = new FakeModel();
  const { ctx } = context(model);
  const invalid = [
    'not json',
    { ...REQUEST, photos: [] },
    { ...REQUEST, photos: [PHOTO, PHOTO, PHOTO, PHOTO] },
    { ...REQUEST, photos: [{ ...PHOTO, mimeType: 'image/gif' }] },
    { ...REQUEST, photos: [{ ...PHOTO, data: 'not base64!' }] },
    { ...REQUEST, photos: [{ ...PHOTO, data: 'abc' }] },
    { ...REQUEST, language: 'fr' },
    { ...REQUEST, meal: 'brunch' },
    { ...REQUEST, note: 'x'.repeat(301) },
    { ...REQUEST, previous: [{ name: 'Rice', grams: 0 }] },
  ];
  for (const body of invalid) {
    const response = await handleEstimateRequest(ask(body), ctx);
    assertEquals(response.status, 400, JSON.stringify(body).slice(0, 80));
    assertEquals((await response.json()).error, 'invalid_request');
  }
  const get = await handleEstimateRequest(new Request('http://localhost/estimate-meal'), ctx);
  assertEquals(get.status, 405);
  assertEquals(model.requests.length, 0);
});

Deno.test('refuses photos too large, alone or together, before asking the model', async () => {
  const model = new FakeModel();
  const { ctx } = context(model);
  const large = { mimeType: 'image/jpeg', data: photoData(1_100_000) };
  const tooLarge = { mimeType: 'image/jpeg', data: photoData(MAX_PHOTO_BYTES + 1) };

  for (const photos of [[tooLarge], [large, large, large]]) {
    const response = await handleEstimateRequest(ask({ ...REQUEST, photos }), ctx);
    assertEquals(response.status, 413);
    assertEquals(await response.json(), { error: 'photos_too_large' });
  }
  // A body larger than any the app sends is not read as JSON at all.
  const huge = ask(`{"photos": "${'x'.repeat(5_000_000)}"}`);
  assertEquals((await handleEstimateRequest(huge, ctx)).status, 413);
  assertEquals(model.requests.length, 0);
});

Deno.test('takes photos at their largest', async () => {
  const model = new FakeModel(answer({ isFood: true, items: [], note: '' }));
  const { ctx } = context(model);
  const largest = { mimeType: 'image/webp', data: photoData(MAX_PHOTO_BYTES) };

  const response = await handleEstimateRequest(
    ask({ ...REQUEST, photos: [largest, largest] }),
    ctx,
  );

  assertEquals(response.status, 200);
  assertEquals(model.requests.length, 1);
});
