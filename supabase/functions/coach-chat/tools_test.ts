import { assertEquals } from '@std/assert';

import { FOOD_QUERY_LENGTH } from '../_shared/foods.ts';
import { type Food, food } from '../_shared/meal/test-foods.ts';
import type { ToolContext } from './tools.ts';
import { runTool, TOOL_DEFINITIONS } from './tools.ts';

const context = {
  supabase: { rpc: () => Promise.resolve({ data: [], error: null }) },
  language: 'en',
  today: '2026-10-30',
  threadId: 7,
} as unknown as ToolContext;

Deno.test('tells the model of each tool with its arguments', () => {
  assertEquals(
    TOOL_DEFINITIONS.map((tool) => tool.name),
    [
      'get_workout_history',
      'get_meal_log',
      'get_week_summary',
      'get_records',
      'search_foods',
      'search_exercises',
      'get_workouts',
      'propose_workout_change',
      'propose_targets_change',
      'log_meal_card',
    ],
  );
});

Deno.test("tells the model each tool's arguments as JSON Schema, from their checks", () => {
  const history = TOOL_DEFINITIONS.find((tool) => tool.name === 'get_workout_history')!;
  assertEquals(history.parameters.type, 'object');
  assertEquals(history.parameters.required, ['from', 'to']);
  assertEquals('$schema' in history.parameters, false);
  const search = TOOL_DEFINITIONS.find((tool) => tool.name === 'search_foods')!;
  const query = (search.parameters.properties as Record<string, { maxLength?: number }>).query;
  // As long as search_foods() searches.
  assertEquals(query.maxLength, FOOD_QUERY_LENGTH.max);
});

Deno.test('answers a wrong call with what is wrong, for the model to correct', async () => {
  assertEquals(await runTool('get_plan', {}, context), { error: 'There is no tool get_plan.' });

  const tooLong = await runTool(
    'get_workout_history',
    { from: '2026-01-01', to: '2026-10-30' },
    context,
  );
  assertEquals(typeof (tooLong as { error: string }).error, 'string');
  for (const day of ['yesterday', '2026-13-45', '2026-02-30']) {
    const notADay = await runTool('get_meal_log', { day }, context);
    assertEquals(typeof (notADay as { error: string }).error, 'string');
  }
});

Deno.test('reads a month of workouts at most', async () => {
  assertEquals(
    await runTool('get_workout_history', { from: '2026-10-01', to: '2026-10-31' }, context),
    [],
  );
});

const LEGS = {
  id: 3,
  name: 'Legs',
  type: null,
  active: true,
  weekdays: [1, 4],
  workout_exercises: [
    {
      exercise_id: 'Barbell_Squat',
      sets: 4,
      target_reps_min: 6,
      target_reps_max: 8,
      target_seconds: null,
      target_meters: null,
      position: 0,
    },
    {
      exercise_id: 'Plank',
      sets: 3,
      target_reps_min: null,
      target_reps_max: null,
      target_seconds: 45,
      target_meters: null,
      position: 1,
    },
  ],
};

const NAMES = [
  {
    id: 'Barbell_Squat',
    name: 'Barbell_Squat',
    exercise_translations: [{ language: 'en', name: 'Back squat' }],
  },
  {
    id: 'Leg_Press',
    name: 'Leg_Press',
    exercise_translations: [{ language: 'en', name: 'Leg press' }],
  },
  { id: 'Plank', name: 'Plank', exercise_translations: [{ language: 'en', name: 'Plank' }] },
];

/** The user's plan and the library, and what `rpc` answers, with the calls made to it. */
function planContext(rpc: Record<string, { data?: unknown; error?: unknown }> = {}) {
  const calls: { name: string; args: unknown }[] = [];
  // Filters by equality, and, as PostgREST, fails the request ordered by a table it does not
  // embed.
  const query = (rows: Record<string, unknown>[]) => {
    let columns = '';
    let error: unknown = null;
    const filters: [string, unknown][] = [];
    const result = () => ({
      data: rows.filter((row) => filters.every(([column, value]) => row[column] === value)),
      error,
    });
    const builder: Record<string, unknown> = {
      select: (selected: string) => ((columns = selected), builder),
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return builder;
      },
      in: () => builder,
      order: (_column: string, options?: { referencedTable?: string }) => {
        if (options?.referencedTable && !columns.includes(options.referencedTable)) {
          error = { code: 'PGRST108', message: `'${options.referencedTable}' is not embedded` };
        }
        return builder;
      },
      maybeSingle: () => Promise.resolve({ data: result().data[0] ?? null, error }),
      then: (resolve: (value: unknown) => void) => resolve(result()),
    };
    return builder;
  };
  const supabase = {
    from: (table: string) => query(table === 'workouts' ? [LEGS] : NAMES),
    rpc: (name: string, args: unknown) => {
      calls.push({ name, args });
      return Promise.resolve({ data: null, error: null, ...rpc[name] });
    },
  };
  return { context: { ...context, supabase } as unknown as ToolContext, calls };
}

Deno.test('reads the plan with its exercises and their targets', async () => {
  const { context } = planContext();
  assertEquals(await runTool('get_workouts', {}, context), [
    {
      id: 3,
      name: 'Legs',
      weekdays: [1, 4],
      exercises: [
        { id: 'Barbell_Squat', name: 'Back squat', sets: 4, target: { reps: { min: 6, max: 8 } } },
        { id: 'Plank', name: 'Plank', sets: 3, target: { seconds: 45 } },
      ],
    },
  ]);
});

Deno.test('proposes swaps to the database, and gives the card as data', async () => {
  const { context, calls } = planContext({ propose_coach_swaps: { data: 41 } });
  const swap = {
    replace: 'Barbell_Squat',
    with: 'Leg_Press',
    sets: 3,
    target: { reps: { min: 10, max: 12 } },
    why: 'Easier on the knee',
  };
  const result = await runTool('propose_workout_change', { workoutId: 3, swaps: [swap] }, context);

  // The database builds the workout from the one it has (propose_coach_swaps()).
  assertEquals(calls, [
    {
      name: 'propose_coach_swaps',
      args: {
        thread_id: 7,
        workout_id: 3,
        swaps: [
          {
            replace: 'Barbell_Squat',
            with: 'Leg_Press',
            sets: 3,
            target: { reps: { min: 10, max: 12 } },
          },
        ],
        today: '2026-10-30',
      },
    },
  ]);
  // Words and numbers the app formats, as the card is kept with the message.
  assertEquals(result, {
    proposal: {
      kind: 'workout',
      id: 41,
      workout: { name: 'Legs', type: null },
      swaps: [
        {
          from: 'Back squat',
          to: 'Leg press',
          sets: 3,
          target: { reps: { min: 10, max: 12 } },
          why: 'Easier on the knee',
        },
      ],
    },
  });
});

Deno.test('says why a proposal was refused, for the model to correct it', async () => {
  const swap = { replace: 'Plank', with: 'Leg_Press', sets: 3, target: { seconds: 30 }, why: 'x' };
  const { context, calls } = planContext({ propose_coach_swaps: { error: { code: 'BB007' } } });
  const unsuited = await runTool(
    'propose_workout_change',
    { workoutId: 3, swaps: [swap] },
    context,
  );
  assertEquals((unsuited as { error: string }).error.startsWith('A target does not suit'), true);
  const { context: missing } = planContext({ propose_coach_swaps: { error: { code: 'BB039' } } });
  const notInIt = await runTool('propose_workout_change', { workoutId: 3, swaps: [swap] }, missing);
  assertEquals((notInIt as { error: string }).error.startsWith('An exercise to replace'), true);

  // An exercise that does not exist is found before anything is proposed.
  const made = calls.length;
  const unknown = await runTool(
    'propose_workout_change',
    { workoutId: 3, swaps: [{ ...swap, with: 'Moon_Walk' }] },
    context,
  );
  assertEquals(unknown, {
    error: 'There is no exercise Moon_Walk; find it with search_exercises.',
  });
  assertEquals(calls.length, made);
});

Deno.test('proposes targets, with the ones in use for the card', async () => {
  const { context, calls } = planContext({
    propose_coach_change: { data: 42 },
    my_nutrition_targets: { data: { calories: 1900, protein_g: 130, carbs_g: 200, fat_g: 60 } },
  });
  const to = { calories: 2100, proteinG: 150, carbsG: 210, fatG: 70 };
  const result = await runTool('propose_targets_change', to, context);

  assertEquals(calls.find((call) => call.name === 'propose_coach_change')?.args, {
    thread_id: 7,
    kind: 'targets',
    change: to,
    today: '2026-10-30',
  });
  assertEquals(result, {
    proposal: {
      kind: 'targets',
      id: 42,
      from: { calories: 1900, proteinG: 130, carbsG: 200, fatG: 60 },
      to,
    },
  });
  const { context: floored } = planContext({ propose_coach_change: { error: { code: 'BB037' } } });
  assertEquals(await runTool('propose_targets_change', { ...to, calories: 1100 }, floored), {
    error: "The calories are under the user's calorie floor.",
  });
});

Deno.test('leaves the targets in use off the card when they cannot be read', async () => {
  const { context } = planContext({
    propose_coach_change: { data: 43 },
    my_nutrition_targets: { error: { code: '57014', message: 'timeout' } },
  });
  const to = { calories: 2100, proteinG: 150, carbsG: 210, fatG: 70 };

  // Not "none": the card cannot say what they were.
  assertEquals(await runTool('propose_targets_change', to, context), {
    proposal: { kind: 'targets', id: 43, to },
  });
});

Deno.test(
  "refuses a workout that is not one of the user's active ones, proposing nothing",
  async () => {
    const { context, calls } = planContext({ propose_coach_swaps: { data: 44 } });
    const swap = {
      replace: 'Plank',
      with: 'Leg_Press',
      sets: 3,
      target: { seconds: 30 },
      why: 'x',
    };

    const result = await runTool(
      'propose_workout_change',
      { workoutId: 9, swaps: [swap] },
      context,
    );

    assertEquals(result, { error: "That workout is not the user's." });
    assertEquals(calls, []);
  },
);

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * The user's foods as search_foods() finds them, and add_coach_meal_card() as the database takes
 * it: refused, as PostgREST and Postgres refuse them, for arguments the function does not have, a
 * meal that is not one, an item that names no food or two, grams out of range, or a day that cannot
 * be logged (BB020); or as `refusal` says.
 */
function mealContext(
  foods: Record<string, Food[]>,
  { refusal, localTime }: { refusal?: { code: string }; localTime?: string } = {},
) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const fail = (code: string) => Promise.resolve({ data: null, error: { code, message: code } });
  const rpc = (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    const names = Object.keys(args).sort().join(',');
    if (name === 'search_foods') {
      if (names !== 'language,query') return fail('PGRST202');
      return Promise.resolve({ data: foods[args.query as string] ?? [], error: null });
    }
    if (name !== 'add_coach_meal_card' || names !== 'day,items,meal,thread_id') {
      return fail('PGRST202');
    }
    if (!MEALS.includes(args.meal as string)) return fail('22P02');
    const items = args.items as Record<string, unknown>[];
    if (!Array.isArray(items) || items.length < 1 || items.length > 12) return fail('22023');
    for (const item of items) {
      const named = ['food_id', 'custom_food_id', 'recipe_id'].filter((key) => key in item);
      const values = ['name', 'kcal', 'protein_g', 'carbs_g', 'fat_g'].every(
        (key) => item[key] !== undefined && item[key] !== null,
      );
      if (named.length > 1 || (named.length === 0 && !values)) return fail('23502');
      const grams = item.grams as number;
      if (typeof grams !== 'number' || !(grams > 0 && grams <= 5000)) return fail('23514');
    }
    const day = Date.parse(`${args.day}T00:00:00Z`);
    const today = Date.parse(`${context.today}T00:00:00Z`);
    if (!(day >= today - 8 * 86_400_000 && day <= today + 86_400_000)) return fail('BB020');
    if (refusal) return fail(refusal.code);
    return Promise.resolve({ data: 51, error: null });
  };
  return {
    context: {
      ...context,
      supabase: { rpc },
      ...(localTime && { localTime }),
    } as unknown as ToolContext,
    calls,
  };
}

const CHICKEN = {
  name: 'Chicken breast',
  searchName: 'Chicken breast, grilled',
  grams: 150,
  confidence: 0.8,
  per100: { kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6 },
};
const RICE = {
  name: 'Rice',
  searchName: 'Rice, boiled',
  grams: 180,
  confidence: 0.7,
  per100: { kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 },
};
const LIBRARY_RICE = food({ food_id: 'C352032', name: 'Rice, boiled' }, 117);

Deno.test('keeps a meal card of the matched foods, and gives the card as data', async () => {
  const { context, calls } = mealContext({ 'Rice, boiled': [LIBRARY_RICE] });

  const result = await runTool(
    'log_meal_card',
    { meal: 'dinner', items: [CHICKEN, RICE], note: 'A solid plate.' },
    context,
  );

  // Searched as the user, then kept as log_meal_estimate() takes it: the found food by its id, and
  // the one the library did not have by its search name with the model's values.
  assertEquals(
    calls.map((call) => call.name),
    ['search_foods', 'search_foods', 'add_coach_meal_card'],
  );
  assertEquals(calls[2].args, {
    thread_id: 7,
    day: '2026-10-30',
    meal: 'dinner',
    items: [
      {
        name: 'Chicken breast, grilled',
        grams: 150,
        kcal: 165,
        protein_g: 31,
        carbs_g: 0,
        fat_g: 3.6,
      },
      { food_id: 'C352032', grams: 180 },
    ],
  });
  assertEquals(result, {
    mealCard: {
      id: 51,
      day: '2026-10-30',
      meal: 'dinner',
      items: [
        { ...CHICKEN, estimated: true },
        {
          ...RICE,
          food: { ref: { kind: 'library', id: 'C352032' }, name: 'Rice, boiled' },
          per100: { kcal: 117, proteinG: 10, carbsG: 20, fatG: 5 },
          estimated: false,
        },
      ],
      note: 'A solid plate.',
    },
  });
});

Deno.test(
  "takes the meal from the time of day when the user named none, and today's day",
  async () => {
    const { context, calls } = mealContext({}, { localTime: '08:15' });
    const result = await runTool('log_meal_card', { items: [RICE] }, context);
    assertEquals((result as { mealCard: { meal: string } }).mealCard.meal, 'breakfast');
    assertEquals(calls.at(-1)?.args.day, '2026-10-30');

    // Without the time, as the app does not send it yet, a snack.
    const { context: timeless } = mealContext({});
    const snack = await runTool('log_meal_card', { items: [RICE], day: '2026-10-29' }, timeless);
    const { meal, day } = (snack as { mealCard: { meal: string; day: string } }).mealCard;
    assertEquals({ meal, day }, { meal: 'snack', day: '2026-10-29' });
  },
);

Deno.test('refuses a day that cannot be logged before searching anything', async () => {
  const { context, calls } = mealContext({});
  for (const day of ['2026-10-31', '2026-10-22']) {
    assertEquals(await runTool('log_meal_card', { items: [RICE], day }, context), {
      error: 'Meals are logged for today and up to 7 days back.',
    });
  }
  assertEquals(calls, []);
});

Deno.test('answers a wrong meal card with what is wrong, for the model to correct', async () => {
  const { context, calls } = mealContext({});
  for (const args of [
    { items: [] },
    { items: Array(13).fill(RICE) },
    { items: [RICE], meal: 'brunch' },
    { items: [{ ...RICE, grams: -1 }] },
  ]) {
    const wrong = await runTool('log_meal_card', args, context);
    assertEquals(typeof (wrong as { error: string }).error, 'string');
  }
  assertEquals(calls, []);
});

Deno.test('says why the database refused a meal card', async () => {
  const { context } = mealContext({}, { refusal: { code: 'BB038' } });
  assertEquals(await runTool('log_meal_card', { items: [RICE] }, context), {
    error: 'The user has had too many meal cards today; ask them to log it in Nutrition.',
  });
  const { context: full } = mealContext({}, { refusal: { code: 'BB024' } });
  const error = (await runTool('log_meal_card', { items: [RICE] }, full)) as { error: string };
  assertEquals(error.error.startsWith('The user has as many foods of their own'), true);
});
