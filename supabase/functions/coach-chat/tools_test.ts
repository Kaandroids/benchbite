import { assertEquals } from '@std/assert';

import type { ToolContext } from './tools.ts';
import { runTool, TOOL_DEFINITIONS } from './tools.ts';

const context = {
  supabase: { rpc: () => Promise.resolve({ data: [], error: null }) },
  language: 'en',
  today: '2026-10-30',
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
    ],
  );
});

Deno.test('answers a wrong call with what is wrong, for the model to correct', async () => {
  assertEquals(await runTool('get_plan', {}, context), { error: 'There is no tool get_plan.' });

  const tooLong = await runTool(
    'get_workout_history',
    { from: '2026-01-01', to: '2026-10-30' },
    context,
  );
  assertEquals(typeof (tooLong as { error: string }).error, 'string');
  const notADay = await runTool('get_meal_log', { day: 'yesterday' }, context);
  assertEquals(typeof (notADay as { error: string }).error, 'string');
});

Deno.test('reads a month of workouts at most', async () => {
  assertEquals(
    await runTool('get_workout_history', { from: '2026-10-01', to: '2026-10-31' }, context),
    [],
  );
});
