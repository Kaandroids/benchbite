import { assertEquals } from '@std/assert';

import { SHOWN_PROPOSAL_KINDS } from '../_shared/coach/chat.ts';
import { FOOD_QUERY_LENGTH } from '../_shared/foods.ts';
import { MAX_ESTIMATE_ITEMS } from '../_shared/meal/estimate.ts';
import { type Food, food } from '../_shared/meal/test-foods.ts';
import type { ToolContext } from './tools.ts';
import { MAX_FOOD_LOG_CHANGES, PROPOSAL_KINDS, runTool, TOOL_DEFINITIONS } from './tools.ts';

const context = {
  supabase: { rpc: () => Promise.resolve({ data: [], error: null }) },
  language: 'en',
  today: '2026-10-30',
  threadId: 7,
  hasText: true,
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
      'propose_food_log_change',
      'log_meal_card',
      'save_note',
      'update_note',
      'archive_note',
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

// Exercises by their own names, which are English, as the library has them.
const NAMES = [
  { id: 'Barbell_Squat', name: 'Back squat', exercise_translations: [] },
  { id: 'Leg_Press', name: 'Leg press', exercise_translations: [] },
  { id: 'Plank', name: 'Plank', exercise_translations: [] },
];

/** The user's plan and the library, and what `rpc` answers, with the calls made to it. */
function planContext(rpc: Record<string, { data?: unknown; error?: unknown }> = {}) {
  const calls: { name: string; args: unknown }[] = [];
  // Filters by equality, but not an embedded table's, whose rows here are in the language asked
  // for, and, as PostgREST, fails the request ordered by a table it does not embed.
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
        if (!column.includes('.')) filters.push([column, value]);
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

type Row = Record<string, unknown>;

/**
 * Exercises as search_exercises reads them, with their translations: the library by English
 * names, a few translated, and the user's own, one archived. Every query is filtered and cut to
 * its limit when it is read, as PostgREST does.
 */
function searchContext(language: 'en' | 'de', more: Row[] = []) {
  const library = (id: string, name: string, de?: string) => ({
    id,
    name,
    owner_id: null,
    archived_at: null,
    exercise_translations: de ? [{ language: 'de', name: de }] : [],
  });
  const own = (id: string, name: string, archived_at: string | null = null) => ({
    id,
    name,
    owner_id: 'user',
    archived_at,
    exercise_translations: [],
  });
  const exercises: Row[] = [
    library('Side_Lateral_Raise', 'Side Lateral Raise', 'Seitheben'),
    library('Barbell_Squat', 'Barbell Squat', 'Kniebeuge'),
    ...more,
    own('Landmine_Press', 'Landmine Press'),
    own('Old_Raise', 'Old Raise', '2026-10-01'),
  ];
  const tables: Record<string, Row[]> = {
    exercises,
    exercise_translations: exercises.flatMap((row) =>
      (row.exercise_translations as Row[]).map((t) => ({ exercise_id: row.id, ...t })),
    ),
  };
  const query = (table: string) => {
    const filters: ((row: Row) => boolean)[] = [];
    let embedded: string | undefined;
    let limit = Infinity;
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        if (column === 'exercise_translations.language') embedded = value as string;
        else filters.push((row) => row[column] === value);
        return builder;
      },
      is: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      not: (column: string) => {
        filters.push((row) => row[column] !== null);
        return builder;
      },
      ilike: (column: string, pattern: string) => {
        const text = pattern.replaceAll('%', '').toLowerCase();
        filters.push((row) => String(row[column]).toLowerCase().includes(text));
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      limit: (count: number) => ((limit = count), builder),
      then: (resolve: (value: unknown) => void) => {
        const rows = tables[table]
          .filter((row) => filters.every((keep) => keep(row)))
          .slice(0, limit)
          .map((row) =>
            embedded === undefined
              ? row
              : {
                  ...row,
                  exercise_translations: (row.exercise_translations as Row[]).filter(
                    (t) => t.language === embedded,
                  ),
                },
          );
        resolve({ data: rows, error: null });
      },
    };
    return builder;
  };
  return { ...context, language, supabase: { from: query } } as unknown as ToolContext;
}

const search = (query: string, context: ToolContext) =>
  runTool('search_exercises', { query }, context);

Deno.test("finds exercises by their English name, named in the user's language", async () => {
  assertEquals(await search('lateral raise', searchContext('en')), [
    { id: 'Side_Lateral_Raise', name: 'Side Lateral Raise' },
  ]);
  assertEquals(await search('lateral raise', searchContext('de')), [
    { id: 'Side_Lateral_Raise', name: 'Seitheben' },
  ]);
  assertEquals(await search('kniebeuge', searchContext('de')), [
    { id: 'Barbell_Squat', name: 'Kniebeuge' },
  ]);
});

Deno.test(
  "finds the user's own exercises first, among many of the library, none archived",
  async () => {
    const presses = Array.from({ length: 40 }, (_, i) => ({
      id: `Press_${i}`,
      name: `Machine Press ${i}`,
      owner_id: null,
      archived_at: null,
      exercise_translations: [],
    }));
    const found = (await search('press', searchContext('en', presses))) as {
      id: string;
      name: string;
    }[];

    assertEquals(found.length, 10);
    assertEquals(found[0], { id: 'Landmine_Press', name: 'Landmine Press' });
    assertEquals(
      ((await search('raise', searchContext('en'))) as { id: string }[]).map((e) => e.id),
      ['Side_Lateral_Raise'],
    );
  },
);

Deno.test('ranks the exercise named as searched first, then names starting so', async () => {
  const squats = ['Front Squat', 'Squat Jump', 'Squat'].map((name) => ({
    id: name.replaceAll(' ', '_'),
    name,
    owner_id: null,
    archived_at: null,
    exercise_translations: [],
  }));
  const found = (await search('squat', searchContext('en', squats))) as { name: string }[];

  assertEquals(
    found.map((e) => e.name),
    ['Squat', 'Squat Jump', 'Barbell Squat', 'Front Squat'],
  );
});

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
    if (!Array.isArray(items) || items.length < 1 || items.length > MAX_ESTIMATE_ITEMS)
      return fail('22023');
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
  'keeps an own food of exactly the search name by its name, and another by its id',
  async () => {
    const { context, calls } = mealContext({
      'Chicken breast, grilled': [
        food({ custom_food_id: 12, name: 'Chicken breast, grilled' }, 160),
      ],
      'Rice, boiled': [food({ custom_food_id: 13, name: 'Rice, boiled (mine)' }, 125)],
    });

    const result = await runTool('log_meal_card', { items: [CHICKEN, RICE] }, context);

    // The own food logging may have made is found by its name, or made again when it is gone
    // (log_meal_estimate()); the one the user named otherwise is theirs, by its id.
    assertEquals(calls[2].args.items, [
      {
        name: 'Chicken breast, grilled',
        grams: 150,
        kcal: 160,
        protein_g: 10,
        carbs_g: 20,
        fat_g: 5,
      },
      { custom_food_id: 13, grams: 180 },
    ]);
    const { items } = (result as { mealCard: { items: { food?: unknown }[] } }).mealCard;
    assertEquals(items[0].food, {
      ref: { kind: 'custom', id: 12 },
      name: 'Chicken breast, grilled',
    });
  },
);

Deno.test(
  "takes the meal from the time of day when the user named none, and today's day",
  async () => {
    const { context, calls } = mealContext({}, { localTime: '08:15' });
    const result = await runTool('log_meal_card', { items: [RICE] }, context);
    assertEquals((result as { mealCard: { meal: string } }).mealCard.meal, 'breakfast');
    assertEquals(calls.at(-1)?.args.day, '2026-10-30');

    // Without the time, as an app from before it sends none, a snack.
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

Deno.test('offers Bite no tool that proposes a change the app has no card for', () => {
  assertEquals(PROPOSAL_KINDS, ['workout', 'targets', 'food_log']);
  for (const kind of PROPOSAL_KINDS) {
    assertEquals((SHOWN_PROPOSAL_KINDS as readonly string[]).includes(kind), true, kind);
  }
});

/** Runs propose_food_log_change. */
const proposeFoodLog = (args: unknown, context: ToolContext) =>
  runTool('propose_food_log_change', args, context);

type Entry = {
  id: number;
  user: string;
  day: string;
  meal: string;
  grams: number;
  kcal: number;
  kcal_per_100g: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  food_id: string | null;
  custom_foods: { name: string } | null;
  recipes: { name: string } | null;
};

/** The user's entries, as row level security lets them read them, and another user's. */
const ENTRIES: Entry[] = [
  {
    id: 21,
    user: 'me',
    day: '2026-10-30',
    meal: 'lunch',
    grams: 300,
    kcal: 798,
    kcal_per_100g: 266,
    protein_g: 33,
    carbs_g: 99,
    fat_g: 30,
    food_id: 'C100',
    custom_foods: null,
    recipes: null,
  },
  {
    id: 22,
    user: 'me',
    day: '2026-10-30',
    meal: 'snack',
    grams: 50,
    kcal: 268,
    kcal_per_100g: 536,
    protein_g: 3,
    carbs_g: 30,
    fat_g: 15,
    food_id: null,
    custom_foods: { name: 'Chocolate bar' },
    recipes: null,
  },
  {
    id: 23,
    user: 'someone else',
    day: '2026-10-30',
    meal: 'dinner',
    grams: 80,
    kcal: 100,
    kcal_per_100g: 125,
    protein_g: 1,
    carbs_g: 1,
    fat_g: 1,
    food_id: 'C100',
    custom_foods: null,
    recipes: null,
  },
];

const ENTRY_COLUMNS = [
  'id',
  'day',
  'meal',
  'grams',
  'kcal',
  'kcal_per_100g',
  'protein_g',
  'carbs_g',
  'fat_g',
  'food_id',
  'custom_foods (name)',
  'recipes (name)',
];

/**
 * The food log as the user reads it, and propose_coach_change() as the database takes a food log
 * change, refusing as PostgREST and Postgres do: arguments the function does not have (PGRST202),
 * a kind or meal that is not one (22P02), a list of the wrong length or shape, or a change that
 * changes nothing (22023), an entry twice (BB045) or not the user's (BB044), a day that cannot be
 * logged (BB020) and grams out of range (23514). Its arguments are sent as JSON, which drops what
 * is undefined.
 */
function foodLogContext(
  overrides: Partial<ToolContext> = {},
  {
    entries = ENTRIES,
    storedEntries,
  }: {
    /** All entries, the user's and another's. */
    entries?: Entry[];
    /** The user's entries as propose_coach_change() finds them, if they changed meanwhile. */
    storedEntries?: Entry[];
  } = {},
) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const fail = (code: string) => Promise.resolve({ data: null, error: { code, message: code } });
  const mine = entries.filter((entry) => entry.user === 'me');
  const proposals: Record<string, unknown>[] = [];
  const from = (table: string) => {
    let error: unknown = null;
    let rows: Record<string, unknown>[] =
      table === 'meal_entries'
        ? mine
        : table === 'coach_proposals'
          ? proposals
          : [{ food_id: 'C100', language: 'en', name: 'Pizza' }];
    const builder: Record<string, unknown> = {
      select: (columns: string) => {
        const unknown = columns
          .split(', ')
          .filter((c) => table === 'meal_entries' && !ENTRY_COLUMNS.includes(c));
        if (unknown.length) {
          error = { code: '42703', message: `${unknown[0]} does not exist` };
        }
        return builder;
      },
      eq: (column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((row) => values.includes(row[column]));
        return builder;
      },
      order: () => builder,
      single: () =>
        Promise.resolve(
          rows.length === 1
            ? { data: rows[0], error: null }
            : { data: null, error: { code: 'PGRST116', message: 'not one row' } },
        ),
      then: (resolve: (value: unknown) => void) => resolve({ data: error ? null : rows, error }),
    };
    return builder;
  };
  const rpc = (name: string, sent: Record<string, unknown>) => {
    const args = JSON.parse(JSON.stringify(sent));
    calls.push({ name, args });
    if (name !== 'propose_coach_change') return fail('PGRST202');
    if (Object.keys(args).sort().join(',') !== 'change,kind,thread_id,today') {
      return fail('PGRST202');
    }
    if (!['workout', 'targets', 'food_log'].includes(args.kind)) {
      return fail('22P02');
    }
    const changes = args.change?.changes;
    if (!Array.isArray(changes) || changes.length < 1 || changes.length > 10) {
      return fail('22023');
    }
    for (const change of changes) {
      const keys = Object.keys(change);
      const changed = keys.filter((key) => ['day', 'meal', 'grams'].includes(key));
      if (
        typeof change.entryId !== 'number' ||
        keys.some((key) => !['entryId', 'day', 'meal', 'grams', 'remove'].includes(key)) ||
        ('remove' in change ? change.remove !== true || changed.length : !changed.length)
      ) {
        return fail('22023');
      }
      if (change.meal !== undefined && !MEALS.includes(change.meal)) {
        return fail('22P02');
      }
    }
    const ids = changes.map((change: { entryId: number }) => change.entryId);
    if (new Set(ids).size !== ids.length) return fail('BB045');
    const found = ids.map((id: number) =>
      (storedEntries ?? entries).find((entry) => entry.id === id && entry.user === 'me'),
    );
    if (found.some((entry: unknown) => !entry)) return fail('BB044');
    for (const [i, change] of changes.entries()) {
      const entry = found[i]!;
      if (
        !change.remove &&
        (change.day ?? entry.day) === entry.day &&
        (change.meal ?? entry.meal) === entry.meal &&
        (change.grams ?? entry.grams) === entry.grams
      ) {
        return fail('22023');
      }
      const day = Date.parse(`${change.day ?? entry.day}T00:00:00Z`);
      const today = Date.parse(`${args.today}T00:00:00Z`);
      if (!(day >= today - 8 * 86_400_000 && day <= today + 86_400_000)) {
        return fail('BB020');
      }
      if (change.grams !== undefined && !(change.grams > 0 && change.grams <= 5000)) {
        return fail('23514');
      }
    }
    // Kept filled in, as food_log_change() does, with the entries as they were.
    proposals.push({
      id: 61,
      change: {
        changes: changes.map((change: Record<string, unknown>, i: number) => {
          const entry = found[i]!;
          return change.remove
            ? { entryId: entry.id, remove: true }
            : {
                entryId: entry.id,
                day: change.day ?? entry.day,
                meal: change.meal ?? entry.meal,
                grams:
                  change.grams === undefined
                    ? entry.grams
                    : Math.round((change.grams as number) * 10) / 10,
              };
        }),
      },
      before: found.map((entry) => {
        const { id, day, meal, grams, kcal_per_100g } = entry!;
        return { id, day, meal, grams, kcal_per_100g };
      }),
    });
    return Promise.resolve({ data: 61, error: null });
  };
  return {
    context: {
      ...context,
      supabase: { from, rpc },
      ...overrides,
    } as unknown as ToolContext,
    calls,
  };
}

Deno.test('gives each entry of the meal log its id, for Bite to name it by', async () => {
  const { context } = foodLogContext();
  const log = (await runTool('get_meal_log', { day: '2026-10-30' }, context)) as {
    id: number;
    food: string;
  }[];
  assertEquals(
    log.map(({ id, food }) => ({ id, food })),
    [
      { id: 21, food: 'Pizza' },
      { id: 22, food: 'Chocolate bar' },
    ],
  );
});

Deno.test('proposes moving and removing entries, and gives the card as data', async () => {
  const { context, calls } = foodLogContext();

  const result = await proposeFoodLog(
    {
      changes: [
        { entryId: 21, meal: 'dinner' },
        { entryId: 22, remove: true },
      ],
    },
    context,
  );

  assertEquals(calls, [
    {
      name: 'propose_coach_change',
      args: {
        thread_id: 7,
        kind: 'food_log',
        change: {
          changes: [
            { entryId: 21, meal: 'dinner' },
            {
              entryId: 22,
              remove: true,
            },
          ],
        },
        today: '2026-10-30',
      },
    },
  ]);
  assertEquals(result, {
    proposal: {
      kind: 'food_log',
      id: 61,
      changes: [
        {
          food: 'Pizza',
          from: { day: '2026-10-30', meal: 'lunch', grams: 300, kcal: 798 },
          to: { day: '2026-10-30', meal: 'dinner', grams: 300, kcal: 798 },
        },
        {
          food: 'Chocolate bar',
          from: { day: '2026-10-30', meal: 'snack', grams: 50, kcal: 268 },
        },
      ],
    },
  });
});

Deno.test('shows new grams on the card with what they add', async () => {
  const { context } = foodLogContext();
  const result = await proposeFoodLog(
    { changes: [{ entryId: 22, grams: 25.04, day: '2026-10-29' }] },
    context,
  );
  const { changes } = (result as { proposal: { changes: { to: unknown }[] } }).proposal;
  // As the entry keeps the grams, to a tenth.
  assertEquals(changes[0].to, {
    day: '2026-10-29',
    meal: 'snack',
    grams: 25,
    kcal: 134,
  });
});

Deno.test('works out the calories on the card as the food log does', async () => {
  const sauce = {
    ...ENTRIES[1],
    id: 24,
    grams: 3,
    kcal: 10,
    kcal_per_100g: 333,
    custom_foods: { name: 'Sauce' },
  };
  const { context } = foodLogContext({}, { entries: [sauce] });
  const result = await proposeFoodLog({ changes: [{ entryId: 24, grams: 300 }] }, context);
  const [change] = (result as { proposal: { changes: { from: unknown; to: unknown }[] } }).proposal
    .changes;
  // From the values per 100 g, not by scaling the rounded 10 kcal, which would show 1000.
  assertEquals(change.from, { day: '2026-10-30', meal: 'snack', grams: 3, kcal: 10 });
  assertEquals(change.to, { day: '2026-10-30', meal: 'snack', grams: 300, kcal: 999 });
});

Deno.test(
  'shows the change as the database kept it, though the entry changed meanwhile',
  async () => {
    // The user moved the pizza to dinner in Nutrition while Bite answered.
    const moved = ENTRIES.map((entry) => (entry.id === 21 ? { ...entry, meal: 'dinner' } : entry));
    const { context } = foodLogContext({}, { storedEntries: moved });
    const result = await proposeFoodLog({ changes: [{ entryId: 21, grams: 150 }] }, context);
    assertEquals(result, {
      proposal: {
        kind: 'food_log',
        id: 61,
        changes: [
          {
            food: 'Pizza',
            from: { day: '2026-10-30', meal: 'dinner', grams: 300, kcal: 798 },
            to: { day: '2026-10-30', meal: 'dinner', grams: 150, kcal: 399 },
          },
        ],
      },
    });
  },
);

Deno.test('proposes no food log change for a message without words', async () => {
  const { context, calls } = foodLogContext({ hasText: false });
  const result = await proposeFoodLog({ changes: [{ entryId: 21, remove: true }] }, context);
  assertEquals(
    (result as { error: string }).error.startsWith('The user asked for no change'),
    true,
  );
  assertEquals(calls, []);
});

Deno.test("passes on the database's refusal of an entry that is not the user's", async () => {
  const { context } = foodLogContext();
  assertEquals(
    await proposeFoodLog(
      {
        changes: [{ entryId: 23, remove: true }],
      },
      context,
    ),
    {
      error: "An entry is not in the user's food log; take the ids from get_meal_log.",
    },
  );
});

Deno.test(
  'answers a wrong food log change with what is wrong, for the model to correct',
  async () => {
    const { context, calls } = foodLogContext();
    for (const changes of [
      [],
      [{ entryId: 21 }],
      [{ entryId: 21, remove: true, grams: 100 }],
      [{ entryId: 21, meal: 'brunch' }],
      [{ entryId: 21, grams: 0 }],
      [
        { entryId: 21, meal: 'dinner' },
        { entryId: 21, grams: 100 },
      ],
      Array.from({ length: MAX_FOOD_LOG_CHANGES + 1 }, (_, i) => ({
        entryId: i + 1,
        remove: true,
      })),
    ]) {
      const wrong = await proposeFoodLog({ changes }, context);
      assertEquals(typeof (wrong as { error: string }).error, 'string');
    }
    assertEquals(calls, []);
    // The database refuses a day that cannot be logged, by its own today.
    for (const day of ['2026-11-01', '2026-10-21']) {
      assertEquals(
        await proposeFoodLog(
          {
            changes: [{ entryId: 21, day }],
          },
          context,
        ),
        {
          error:
            'Meals are logged for today and up to 7 days back; an entry on another day, or moved to one, cannot be changed.',
        },
      );
    }
  },
);

Deno.test('says why the database refused a food log change', async () => {
  const { context } = foodLogContext();
  assertEquals(
    await proposeFoodLog(
      {
        changes: [{ entryId: 21, meal: 'lunch' }],
      },
      context,
    ),
    {
      error: 'Each change must change its entry: another day, meal or grams, or its removal.',
    },
  );
});

/**
 * The notebook as the note tools write it: the profile's setting `saves`, and what writing a note
 * gives, with what each write sent.
 */
function noteContext(
  saves: boolean | null,
  written: { data?: unknown; error?: unknown } = {
    data: { id: 9, category: 'allergy', text: 'Allergic to kiwi' },
  },
) {
  const writes: { op: string; values?: unknown; filters: [string, unknown][] }[] = [];
  const supabase = {
    from: (table: string) => {
      const write = { op: '', values: undefined as unknown, filters: [] as [string, unknown][] };
      const builder: Record<string, unknown> = {
        select: () => builder,
        insert: (values: unknown) => ((write.op = 'insert'), (write.values = values), builder),
        update: (values: unknown) => ((write.op = 'update'), (write.values = values), builder),
        eq: (column: string, value: unknown) => (write.filters.push([column, value]), builder),
        is: (column: string, value: unknown) => (write.filters.push([column, value]), builder),
        maybeSingle: () => {
          if (table === 'profiles') {
            return Promise.resolve({
              data: saves === null ? null : { coach_saves_notes: saves },
              error: null,
            });
          }
          writes.push(write);
          return Promise.resolve({ data: null, error: null, ...written });
        },
        single: () => {
          writes.push(write);
          return Promise.resolve({ data: null, error: null, ...written });
        },
      };
      return builder;
    },
  };
  return { context: { ...context, supabase } as unknown as ToolContext, writes };
}

Deno.test('saves a note from the chat, or asks first when saving is off', async () => {
  const args = { category: 'allergy', text: 'Allergic to kiwi' };
  const on = noteContext(true);
  assertEquals(await runTool('save_note', args, on.context), {
    note: { id: 9, category: 'allergy', text: 'Allergic to kiwi', action: 'saved' },
  });
  assertEquals(on.writes[0].values, {
    category: 'allergy',
    text: 'Allergic to kiwi',
    source: 'chat',
    thread_id: 7,
    asked: false,
    review_on: null,
  });

  const off = noteContext(false);
  assertEquals(await runTool('save_note', args, off.context), {
    note: { id: 9, category: 'allergy', text: 'Allergic to kiwi', action: 'asked' },
  });
  assertEquals((off.writes[0].values as { asked: boolean }).asked, true);
  // A setting that cannot be read asks first too.
  const unread = noteContext(null);
  await runTool('save_note', args, unread.context);
  assertEquals((unread.writes[0].values as { asked: boolean }).asked, true);
});

Deno.test('asks again about a note only on a day ahead, within half a year', async () => {
  const injury = { category: 'injury', text: 'Knee hurts on deep squats' };
  for (const reviewOn of ['2026-10-30', '2027-06-01']) {
    const { context, writes } = noteContext(true);
    assertEquals(await runTool('save_note', { ...injury, reviewOn }, context), {
      error: 'A day to ask again is after today and within 180 days.',
    });
    assertEquals(writes, []);
  }
  const { context, writes } = noteContext(true);
  await runTool('save_note', { ...injury, reviewOn: '2026-11-06' }, context);
  assertEquals((writes[0].values as { review_on: string }).review_on, '2026-11-06');
});

Deno.test('changes and archives only a note in use, and says when there is none', async () => {
  const changed = noteContext(true);
  assertEquals(
    await runTool('update_note', { id: 9, text: 'Allergic to kiwi and mango' }, changed.context),
    { note: { id: 9, category: 'allergy', text: 'Allergic to kiwi', action: 'updated' } },
  );
  assertEquals(changed.writes[0], {
    op: 'update',
    values: { text: 'Allergic to kiwi and mango' },
    filters: [
      ['id', 9],
      ['archived_at', null],
    ],
  });
  const cleared = noteContext(true);
  await runTool('update_note', { id: 9, reviewOn: null }, cleared.context);
  assertEquals(cleared.writes[0].values, { review_on: null });
  assertEquals(
    typeof ((await runTool('update_note', { id: 9 }, cleared.context)) as { error: string }).error,
    'string',
  );

  const archived = noteContext(true);
  assertEquals(await runTool('archive_note', { id: 9, reason: 'Healed' }, archived.context), {
    note: { id: 9, category: 'allergy', text: 'Allergic to kiwi', action: 'archived' },
  });
  assertEquals((archived.writes[0].values as { archive_reason: string }).archive_reason, 'Healed');

  const gone = noteContext(true, { data: null });
  assertEquals(await runTool('archive_note', { id: 4, reason: 'Healed' }, gone.context), {
    error: 'There is no such note in use; take its id from the snapshot.',
  });
});

Deno.test('says when the notebook is full', async () => {
  const { context } = noteContext(true, { error: { code: 'BB046' } });
  const result = await runTool('save_note', { category: 'food', text: 'Vegan' }, context);
  assertEquals(
    (result as { error: string }).error.startsWith('The notebook has as many notes in use'),
    true,
  );
});
