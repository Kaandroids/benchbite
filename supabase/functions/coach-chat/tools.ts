// What Bite may look up while it answers (#292, ADR 0052): the user's training, meals, weeks and
// records, and the food and exercise libraries. Each tool reads with the user's token, so row
// level security decides what it sees, and returns little, to keep the answer cheap.
import { z } from 'zod';

import type { CoachToolName } from '../_shared/coach/chat.ts';
import type { Tool } from '../_shared/llm/mod.ts';
import { type Client, logError } from '../_shared/supabase.ts';
import { addDays, DAY, daysBetween } from './day.ts';
import type { Language } from './prompt.ts';
import { workoutName } from './snapshot.ts';

export type ToolContext = { supabase: Client; language: Language; today: string };

/** The most days one look at the history may cover. */
const MAX_DAYS = 31;

const QUERY = z.string().trim().min(2).max(80);

type CoachTool<A extends z.ZodType> = {
  /** One of the names the app knows (`COACH_TOOLS`), which it says what Bite is doing by. */
  name: CoachToolName;
  description: string;
  /** The arguments, which the model is told of and its calls are checked against. */
  args: A;
  run: (args: z.infer<A>, context: ToolContext) => Promise<unknown>;
};

const tool = <A extends z.ZodType>(definition: CoachTool<A>) => definition;

const TOOLS = [
  tool({
    name: 'get_workout_history',
    description:
      "The user's training day by day, from one day to another: the workouts planned, how many were done and missed, and how long and how much they lifted.",
    args: z
      .object({
        from: DAY.describe('The first day, YYYY-MM-DD.'),
        to: DAY.describe(`The last day, YYYY-MM-DD, at most ${MAX_DAYS} days after the first.`),
      })
      .refine(({ from, to }) => from <= to && daysBetween(from, to) < MAX_DAYS, {
        message: `from must come before to, at most ${MAX_DAYS} days apart`,
      }),
    run: async ({ from, to }, { supabase, today }) => {
      const range = { from_day: from, to_day: to, today };
      const [planned, training] = await Promise.all([
        supabase.rpc('planned_workouts', range),
        supabase.rpc('day_training', range),
      ]);
      const plans = Map.groupBy(read(planned), (workout) => workout.day);
      return read(training).map((day) => ({
        day: day.day,
        planned: plans.get(day.day)?.map(workoutName) ?? [],
        done: day.done,
        missed: day.missed,
        minutes: day.minutes,
        liftedKg: day.lifted_kg,
      }));
    },
  }),
  tool({
    name: 'get_meal_log',
    description: "What the user ate on one day, meal by meal, with each food's grams and macros.",
    args: z.object({ day: DAY.describe('The day, YYYY-MM-DD.') }),
    run: async ({ day }, { supabase, language }) => {
      const entries = read(
        await supabase
          .from('meal_entries')
          .select(
            'meal, grams, kcal, protein_g, carbs_g, fat_g, food_id, custom_foods (name), recipes (name)',
          )
          .eq('day', day)
          .order('created_at'),
      );
      const ids = entries.flatMap((entry) => (entry.food_id ? [entry.food_id] : []));
      const names = ids.length
        ? inLanguage(
            read(
              await supabase
                .from('food_names')
                .select('food_id, language, name')
                .in('language', [language, 'en'])
                .in('food_id', ids),
            ).map((row) => ({ id: row.food_id, language: row.language, name: row.name })),
            language,
          )
        : new Map<string, string>();
      return entries.map((entry) => ({
        meal: entry.meal,
        food:
          (entry.food_id && names.get(entry.food_id)) ??
          entry.custom_foods?.name ??
          entry.recipes?.name,
        grams: entry.grams,
        kcal: entry.kcal,
        proteinG: entry.protein_g,
        carbsG: entry.carbs_g,
        fatG: entry.fat_g,
      }));
    },
  }),
  tool({
    name: 'get_week_summary',
    description:
      "The user's eating and training on each day of a week: calories and protein against the targets, and the workouts done and missed.",
    args: z.object({ week_start: DAY.describe('The Monday of the week, YYYY-MM-DD.') }),
    run: async ({ week_start }, { supabase, today }) => {
      const range = { from_day: week_start, to_day: addDays(week_start, 6), today };
      const [nutrition, training] = await Promise.all([
        supabase.rpc('day_nutrition', range),
        supabase.rpc('day_training', range),
      ]);
      const trained = new Map(read(training).map((day) => [day.day, day]));
      return read(nutrition).map((day) => ({
        day: day.day,
        kcal: day.kcal,
        targetKcal: day.target_calories,
        proteinG: day.protein_g,
        targetProteinG: day.target_protein_g,
        workoutsDone: trained.get(day.day)?.done ?? 0,
        workoutsMissed: trained.get(day.day)?.missed ?? 0,
      }));
    },
  }),
  tool({
    name: 'get_records',
    description:
      "The user's latest personal records, the newest first: each with the set it came from, its value in the units of its kind (kg for weights and one-rep maxes, seconds, meters, seconds per km for pace), and the value it beat.",
    args: z.object({}),
    run: async (_args, { supabase, language }) => {
      const records = read(await supabase.rpc('record_history')).slice(0, 15);
      const names = await exerciseNames(
        supabase,
        language,
        records.map((r) => r.exercise_id),
      );
      return records.map((record) => ({
        exercise: names.get(record.exercise_id) ?? record.exercise_id,
        kind: record.kind,
        on: record.achieved_on,
        value: record.value,
        previous: record.previous,
        weightKg: record.weight_kg,
        reps: record.reps,
        seconds: record.seconds,
        meters: record.meters,
      }));
    },
  }),
  tool({
    name: 'search_foods',
    description:
      "Foods in the library and the user's own foods and recipes that match a name, with their values per 100 g and their usual portion in grams.",
    args: z.object({ query: QUERY.describe('A food name, such as "oat flakes".') }),
    run: async ({ query }, { supabase, language }) =>
      read(await supabase.rpc('search_foods', { language, query }))
        .slice(0, 10)
        .map((food) => ({
          name: food.name,
          per100g: {
            kcal: food.kcal,
            proteinG: food.protein_g,
            carbsG: food.carbs_g,
            fatG: food.fat_g,
          },
          portion: { unit: food.portion_unit, grams: food.portion_grams },
        })),
  }),
  tool({
    name: 'search_exercises',
    description: "Exercises in the library and the user's own whose name matches.",
    args: z.object({ query: QUERY.describe('An exercise name, such as "squat".') }),
    run: async ({ query }, { supabase, language }) => {
      const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const [translated, own] = await Promise.all([
        supabase
          .from('exercise_translations')
          .select('exercise_id, language, name')
          .in('language', [language, 'en'])
          .ilike('name', pattern)
          .limit(20),
        supabase
          .from('exercises')
          .select('id, name')
          .not('owner_id', 'is', null)
          .is('archived_at', null)
          .ilike('name', pattern)
          .limit(10),
      ]);
      const found = inLanguage(
        read(translated).map((row) => ({
          id: row.exercise_id,
          language: row.language,
          name: row.name,
        })),
        language,
      );
      for (const exercise of read(own)) found.set(exercise.id, exercise.name);
      return [...found].slice(0, 10).map(([id, name]) => ({ id, name }));
    },
  }),
];

/** The tools as the model is told of them, their arguments as JSON Schema. */
export const TOOL_DEFINITIONS: Tool[] = TOOLS.map(({ name, description, args }) => {
  const { $schema: _, ...parameters } = z.toJSONSchema(args, { io: 'input' });
  return { name, description, parameters };
});

/**
 * Runs a tool the model called. A tool that does not exist or whose arguments are wrong says so
 * in its result, for the model to correct, rather than failing the answer.
 */
export async function runTool(name: string, args: unknown, context: ToolContext): Promise<unknown> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { error: `There is no tool ${name}.` };
  const parsed = tool.args.safeParse(args);
  if (!parsed.success) return { error: z.prettifyError(parsed.error) };
  try {
    // deno-lint-ignore no-explicit-any
    return await tool.run(parsed.data as any, context);
  } catch (error) {
    logError(`The tool ${name} failed`, error);
    return { error: 'The data could not be read just now.' };
  }
}

function read<T>({ data, error }: { data: T[] | null; error: unknown }): T[] {
  if (error) throw error;
  return data ?? [];
}

/** Each thing's name in `language`, or in English, which every library name has. */
function inLanguage(
  rows: { id: string; language: string; name: string }[],
  language: string,
): Map<string, string> {
  const names = new Map<string, string>();
  for (const row of rows) {
    if (row.language === language || !names.has(row.id)) names.set(row.id, row.name);
  }
  return names;
}

/** Exercises' names in `language`, else in English, else their own, as the app names them. */
async function exerciseNames(supabase: Client, language: Language, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = read(
    await supabase
      .from('exercises')
      .select('id, name, exercise_translations (language, name)')
      .in('id', ids)
      .in('exercise_translations.language', [language, 'en']),
  );
  return new Map(
    rows.map((row) => {
      const translated = inLanguage(
        row.exercise_translations.map((t) => ({ id: row.id, language: t.language, name: t.name })),
        language,
      );
      return [row.id, translated.get(row.id) ?? row.name];
    }),
  );
}
