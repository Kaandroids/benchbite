// What Bite may look up while it answers (#292): the user's workouts, meals, weeks and records,
// and the food and exercise libraries. Each tool reads with the user's token, so row level
// security decides what it sees, and returns little, to keep the answer cheap.
import { z } from 'zod';

import type { Tool } from '../_shared/llm/mod.ts';
import type { Language } from './prompt.ts';
import type { Client } from './snapshot.ts';

export type ToolContext = { supabase: Client; language: Language; today: string };

const DAY = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => !isNaN(Date.parse(day)));

/** The most days one look at the history may cover. */
const MAX_DAYS = 31;

const Range = z
  .object({ from: DAY, to: DAY })
  .refine(({ from, to }) => from <= to && daysBetween(from, to) < MAX_DAYS, {
    message: `from must come before to, at most ${MAX_DAYS} days apart`,
  });

type Handler = (args: unknown, context: ToolContext) => Promise<unknown>;

type CoachTool = Tool & { run: Handler };

const TOOLS: CoachTool[] = [
  {
    name: 'get_workout_history',
    description: `The user's training day by day from one date to another, at most ${MAX_DAYS} days: the workouts planned, how many were done and missed, and how long and how much they lifted.`,
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'The first day, YYYY-MM-DD.' },
        to: { type: 'string', description: 'The last day, YYYY-MM-DD.' },
      },
      required: ['from', 'to'],
    },
    run: async (args, { supabase, today }) => {
      const { from, to } = Range.parse(args);
      const range = { from_day: from, to_day: to, today };
      const [planned, training] = await Promise.all([
        supabase.rpc('planned_workouts', range),
        supabase.rpc('day_training', range),
      ]);
      const plans = Map.groupBy(read(planned), (workout) => workout.day);
      return read(training).map((day) => ({
        day: day.day,
        planned: plans.get(day.day)?.map((workout) => workout.name) ?? [],
        done: day.done,
        missed: day.missed,
        minutes: day.minutes,
        liftedKg: day.lifted_kg,
      }));
    },
  },
  {
    name: 'get_meal_log',
    description: "What the user ate on one day, meal by meal, with each food's grams and macros.",
    parameters: {
      type: 'object',
      properties: { day: { type: 'string', description: 'The day, YYYY-MM-DD.' } },
      required: ['day'],
    },
    run: async (args, { supabase, language }) => {
      const { day } = z.object({ day: DAY }).parse(args);
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
      const names = new Map(
        ids.length
          ? read(
              await supabase
                .from('food_names')
                .select('food_id, name')
                .eq('language', language)
                .in('food_id', ids),
            ).map((food) => [food.food_id, food.name])
          : [],
      );
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
  },
  {
    name: 'get_week_summary',
    description:
      "The user's eating and training of each day of a week: calories and macros against the targets, and workouts done and missed.",
    parameters: {
      type: 'object',
      properties: {
        week_start: { type: 'string', description: 'The Monday of the week, YYYY-MM-DD.' },
      },
      required: ['week_start'],
    },
    run: async (args, { supabase, today }) => {
      const { week_start } = z.object({ week_start: DAY }).parse(args);
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
  },
  {
    name: 'get_records',
    description: "The user's latest personal records, the newest first.",
    parameters: { type: 'object', properties: {} },
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
        weightKg: record.weight_kg,
        reps: record.reps,
        previous: record.previous,
      }));
    },
  },
  {
    name: 'search_foods',
    description:
      "Foods in the library and the user's own foods and recipes that match a name, with their values per 100 g and their usual portion in grams.",
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'A food name, such as "oat flakes".' } },
      required: ['query'],
    },
    run: async (args, { supabase, language }) => {
      const { query } = z.object({ query: z.string().trim().min(2).max(80) }).parse(args);
      return read(await supabase.rpc('search_foods', { language, query }))
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
        }));
    },
  },
  {
    name: 'search_exercises',
    description: 'Exercises in the library whose name matches.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'An exercise name, such as "squat".' } },
      required: ['query'],
    },
    run: async (args, { supabase, language }) => {
      const { query } = z.object({ query: z.string().trim().min(2).max(80) }).parse(args);
      const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      return read(
        await supabase
          .from('exercise_translations')
          .select('exercise_id, name')
          .eq('language', language)
          .ilike('name', pattern)
          .limit(10),
      ).map((exercise) => ({ id: exercise.exercise_id, name: exercise.name }));
    },
  },
];

/** The tools as the model is told of them. */
export const TOOL_DEFINITIONS: Tool[] = TOOLS.map(({ name, description, parameters }) => ({
  name,
  description,
  parameters,
}));

/**
 * Runs a tool the model called. A tool that does not exist or whose arguments are wrong says so
 * in its result, for the model to correct, rather than failing the answer.
 */
export async function runTool(name: string, args: unknown, context: ToolContext): Promise<unknown> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { error: `There is no tool ${name}.` };
  try {
    return await tool.run(args, context);
  } catch (error) {
    if (error instanceof z.ZodError) return { error: z.prettifyError(error) };
    console.error(`The tool ${name} failed`, error);
    return { error: 'The data could not be read just now.' };
  }
}

function read<T>({ data, error }: { data: T[] | null; error: unknown }): T[] {
  if (error) throw error;
  return data ?? [];
}

async function exerciseNames(supabase: Client, language: Language, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = read(
    await supabase
      .from('exercise_translations')
      .select('exercise_id, name')
      .eq('language', language)
      .in('exercise_id', ids),
  );
  return new Map(rows.map((row) => [row.exercise_id, row.name]));
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}
