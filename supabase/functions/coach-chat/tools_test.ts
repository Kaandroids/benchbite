import { assertEquals } from '@std/assert';

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
  assertEquals(query.maxLength, 80);
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
  // As PostgREST: ordering by a table the query does not embed fails the request.
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
      eq: (column: string, value: unknown) => (
        column === 'id' && filters.push([column, value]),
        builder
      ),
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
