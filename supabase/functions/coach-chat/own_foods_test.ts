import { assertEquals } from '@std/assert';

import type { FoundFood } from './own_foods.ts';
import { recipeCard } from './own_foods.ts';
import type { ToolContext } from './tools.ts';
import { runTool } from './tools.ts';

const row = (fields: Partial<FoundFood> & Pick<FoundFood, 'name' | 'kcal'>): FoundFood => ({
  food_id: null,
  custom_food_id: null,
  recipe_id: null,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  portion_unit: 'serving',
  portion_grams: 100,
  ...fields,
});

const LENTILS = row({
  food_id: 'H111000',
  name: 'Red lentils, dried',
  kcal: 340,
  protein_g: 24,
});
const ONION = row({
  food_id: 'G480100',
  name: 'Onion',
  kcal: 30,
  portion_unit: 'piece',
  portion_grams: 110,
});
const STOCK = row({
  custom_food_id: 4,
  name: 'Stock, mine',
  kcal: 10,
  portion_unit: null,
  portion_grams: null,
});
const SOUP = row({
  recipe_id: 9,
  name: 'Lentil soup',
  kcal: 80,
  portion_unit: 'bowl',
  portion_grams: 380,
});
const OATS = row({ food_id: 'C133000', name: 'Oat flakes', kcal: 372 });
const CHOCOLATE = row({
  food_id: 'S512000',
  name: 'Milk chocolate',
  kcal: 536,
});

type Call = { name: string; args: Record<string, unknown> };

/** A chat's context whose database finds `foods` by name, has `favourites`, and keeps proposals. */
function foodContext({
  favourites = [] as FoundFood[],
  refusal,
  hasText = true,
}: {
  favourites?: FoundFood[];
  refusal?: { code: string };
  hasText?: boolean;
} = {}) {
  const calls: Call[] = [];
  const foods = [LENTILS, ONION, STOCK, SOUP, OATS, CHOCOLATE];
  const supabase = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === 'search_foods') {
        const query = String(args.query).toLowerCase();
        return Promise.resolve({
          data: foods.filter((food) => food.name.toLowerCase().startsWith(query)),
          error: null,
        });
      }
      if (name === 'list_favourite_foods') {
        return Promise.resolve({ data: favourites, error: null });
      }
      if (name === 'propose_coach_change') {
        return Promise.resolve(
          refusal ? { data: null, error: refusal } : { data: 21, error: null },
        );
      }
      return Promise.resolve({ data: [], error: null });
    },
  };
  const context = {
    supabase,
    language: 'en',
    today: '2026-11-26',
    threadId: 7,
    hasText,
  } as unknown as ToolContext;
  const proposed = () => calls.find((call) => call.name === 'propose_coach_change')?.args;
  return { context, calls, proposed };
}

const RECIPE = {
  name: ' Lentil soup ',
  servings: 4,
  servingUnit: 'bowl',
  ingredients: [
    { name: 'Red lentils, dried', grams: 250 },
    { name: 'onion', portions: 1 },
    { name: 'Stock, mine', grams: 1000 },
  ],
};

Deno.test(
  'proposes a recipe of the foods search_foods names, and gives the card as data',
  async () => {
    const { context, proposed } = foodContext();
    const result = await runTool('propose_recipe', RECIPE, context);
    assertEquals(proposed(), {
      thread_id: 7,
      kind: 'recipe',
      change: {
        name: 'Lentil soup',
        servings: 4,
        servingUnit: 'bowl',
        ingredients: [
          { foodId: 'H111000', grams: 250 },
          {
            foodId: 'G480100',
            grams: 110,
            portionUnit: 'piece',
            portionCount: 1,
          },
          { customFoodId: 4, grams: 1000 },
        ],
      },
      today: '2026-11-26',
    });
    assertEquals(result, {
      proposal: {
        kind: 'recipe',
        id: 21,
        name: 'Lentil soup',
        servings: 4,
        servingUnit: 'bowl',
        ingredients: [
          { name: 'Red lentils, dried', grams: 250, kcal: 850 },
          {
            name: 'Onion',
            grams: 110,
            kcal: 33,
            portion: { unit: 'piece', count: 1 },
          },
          { name: 'Stock, mine', grams: 1000, kcal: 100 },
        ],
        // (850 + 33 + 100) / 4 kcal, 1360 / 4 g.
        serving: { grams: 340, kcal: 245.8, proteinG: 15, carbsG: 0, fatG: 0 },
      },
    });
  },
);

Deno.test('proposes no recipe of a food search_foods does not name, nor of a recipe', async () => {
  const { context, proposed } = foodContext();
  const result = (await runTool(
    'propose_recipe',
    {
      ...RECIPE,
      ingredients: [
        { name: 'Harissa', grams: 20 },
        {
          name: 'Lentil soup',
          grams: 200,
        },
      ],
    },
    context,
  )) as { error: string };
  assertEquals(
    result.error.startsWith(
      "Not found in the food library or the user's own foods: Harissa, Lentil soup.",
    ),
    true,
  );
  assertEquals(proposed(), undefined);
});

Deno.test('asks for grams of a food without a portion', async () => {
  const { context } = foodContext();
  const result = await runTool(
    'propose_recipe',
    { ...RECIPE, ingredients: [{ name: 'Stock, mine', portions: 2 }] },
    context,
  );
  assertEquals(result, {
    error: 'Stock, mine has no portion: give its grams.',
  });
});

Deno.test('proposes no recipe or favourite for a message without words', async () => {
  const { context, calls } = foodContext({ hasText: false });
  for (const [tool, args] of [
    ['propose_recipe', RECIPE],
    ['propose_favourites', { add: ['Oat flakes'] }],
  ] as const) {
    const result = (await runTool(tool, args, context)) as { error: string };
    assertEquals(result.error.startsWith('The user asked for no change in words.'), true);
  }
  assertEquals(calls, []);
});

Deno.test('says why the database refused a recipe', async () => {
  const { context } = foodContext({ refusal: { code: 'BB068' } });
  const result = (await runTool('propose_recipe', RECIPE, context)) as {
    error: string;
  };
  assertEquals(result.error.startsWith('The user has a recipe of that name already'), true);
});

Deno.test('works out a serving as recipe_values does', () => {
  const card = recipeCard(
    1,
    {
      name: 'Porridge',
      servings: 3,
      servingUnit: 'bowl',
    },
    [{ food: OATS, grams: 100 }],
  );
  assertEquals(card.serving, {
    grams: 33.3,
    kcal: 124,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
  });
});

Deno.test('proposes adding and removing favourites, and gives the card as data', async () => {
  const { context, proposed } = foodContext({ favourites: [CHOCOLATE] });
  const result = await runTool(
    'propose_favourites',
    { add: ['Oat flakes', 'Lentil soup'], remove: ['milk chocolate'] },
    context,
  );
  assertEquals(proposed(), {
    thread_id: 7,
    kind: 'favourites',
    change: {
      add: [{ foodId: 'C133000' }, { recipeId: 9 }],
      remove: [{ foodId: 'S512000' }],
    },
    today: '2026-11-26',
  });
  assertEquals(result, {
    proposal: {
      kind: 'favourites',
      id: 21,
      foods: [
        { name: 'Oat flakes', add: true, kcal: 372 },
        // A recipe by the serving: 80 kcal per 100 g, 380 g a bowl.
        { name: 'Lentil soup', add: true, kcal: 304, serving: 'bowl' },
        { name: 'Milk chocolate', add: false, kcal: 536 },
      ],
    },
  });
});

Deno.test('proposes no favourite already one, nor removes one that is none', async () => {
  const { context, proposed } = foodContext({ favourites: [OATS] });
  assertEquals(await runTool('propose_favourites', { add: ['Oat flakes'] }, context), {
    error: 'Favourites already: Oat flakes. Leave them out.',
  });
  assertEquals(await runTool('propose_favourites', { remove: ['Milk chocolate'] }, context), {
    error: "Not among the user's favourites: Milk chocolate.",
  });
  const none = (await runTool('propose_favourites', {}, context)) as {
    error: string;
  };
  assertEquals(typeof none.error, 'string');
  assertEquals(proposed(), undefined);
});

Deno.test('marks recipes and favourites among the foods found', async () => {
  const { context } = foodContext({ favourites: [OATS] });
  const found = (await runTool('search_foods', { query: 'o' + 'at' }, context)) as Record<
    string,
    unknown
  >[];
  assertEquals(
    found.map((food) => [food.name, food.favourite, food.recipe]),
    [['Oat flakes', true, undefined]],
  );
  const soup = (await runTool('search_foods', { query: 'lentil' }, context)) as Record<
    string,
    unknown
  >[];
  assertEquals(
    soup.map((food) => [food.name, food.favourite, food.recipe]),
    [['Lentil soup', undefined, true]],
  );
});
