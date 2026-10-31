// What Bite may look up while it answers (#292, ADR 0052): the user's training, meals, weeks,
// records and plan, and the food and exercise libraries; the changes it may propose, which the
// user applies (ADR 0058); and the meals it estimates, as cards the user adds (ADR 0062). Each
// tool runs with the user's token, so row level security and the database's functions decide what
// it sees and may do, and returns little, to keep the answer cheap.
import { z } from 'zod';

import type { CoachToolName, DayTargets, MealCard, ProposalCard } from '../_shared/coach/chat.ts';
import { Constants } from '../_shared/database.types.ts';
import { FOOD_QUERY_LENGTH } from '../_shared/foods.ts';
import type { Tool } from '../_shared/llm/mod.ts';
import { MAX_ESTIMATE_ITEMS } from '../_shared/meal/estimate.ts';
import { ModelItem } from '../_shared/meal/item.ts';
import { matchItems } from '../_shared/meal/match.ts';
import type { Language } from '../_shared/prompt.ts';
import { type Client, logError } from '../_shared/supabase.ts';
import { addDays, DAY, daysBetween } from './day.ts';
import { logItem, mealAt } from './meal_card.ts';
import { workoutName } from './workout.ts';

export type ToolContext = {
  supabase: Client;
  language: Language;
  today: string;
  /** The thread the answer goes on in, which a proposal or a meal card belongs to. */
  threadId: number;
  /**
   * The device's local time, HH:MM, when the app sends it, which picks the meal of a card the user
   * named none for.
   */
  localTime?: string;
};

/**
 * How many days back a meal may be logged, as check_meal_day() allows. The database decides
 * (BB020); the tool's check only saves the searches for a day it would refuse.
 */
const MEAL_DAYS_BACK = 7;

/** The most days one look at the history may cover. */
const MAX_DAYS = 31;

const QUERY = z.string().trim().min(2).max(80);

/** A food name, as long as search_foods() searches. */
const FOOD_QUERY = z.string().trim().min(FOOD_QUERY_LENGTH.min).max(FOOD_QUERY_LENGTH.max);

/** Why Bite proposes a change, in the user's language, as the card shows it. */
const WHY = z.string().trim().min(1).max(120);

/** What the database's refusals of a proposal mean, for the model to correct it. */
const REFUSALS: Record<string, string> = {
  BB006: "That workout is not the user's.",
  BB007:
    'A target does not suit its exercise: reps for reps, seconds for timed, meters for distance.',
  BB008: 'Too many exercises for a workout.',
  BB037: "The calories are under the user's calorie floor.",
  BB038: 'The user has too many changes waiting; ask them to decide those first.',
  BB039: 'An exercise to replace is not in the workout; take it from get_workouts.',
  BB040: 'Swaps may not replace an exercise twice, or one another.',
  '23514': 'The values are out of range, or the macros add up to more than the calories.',
};

/** The user may save no more foods of their own, which an item the library lacks needs. */
const NO_MORE_OWN_FOODS =
  'The user has as many foods of their own as they may have, so an item the library does not have cannot be saved; tell them.';

/** What the database's refusals of a meal card mean, for the model to correct it. */
const MEAL_REFUSALS: Record<string, string> = {
  BB020: `Meals are logged for today and up to ${MEAL_DAYS_BACK} days back.`,
  BB021: 'That day has as many entries as it may have.',
  BB024: NO_MORE_OWN_FOODS,
  BB026: NO_MORE_OWN_FOODS,
  BB038: 'The user has had too many meal cards today; ask them to log it in Nutrition.',
  '23514': 'A value is out of range.',
};

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
    args: z.object({ query: FOOD_QUERY.describe('A food name, such as "oat flakes".') }),
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
  tool({
    name: 'get_workouts',
    description:
      "The user's active workouts: each one's id, name, weekdays (1 Monday to 7 Sunday) and exercises, with their ids, sets and targets.",
    args: z.object({}),
    run: async (_args, { supabase, language }) => {
      const workouts = read(await planWorkouts(supabase));
      const names = await exerciseNames(
        supabase,
        language,
        workouts.flatMap((w) => w.workout_exercises.map((e) => e.exercise_id)),
      );
      return workouts.map((workout) => ({
        id: workout.id,
        name: workoutName(workout),
        weekdays: workout.weekdays,
        exercises: workout.workout_exercises.map((e) => ({
          id: e.exercise_id,
          name: names.get(e.exercise_id) ?? e.exercise_id,
          sets: e.sets,
          target: targetOf(e),
        })),
      }));
    },
  }),
  tool({
    name: 'propose_workout_change',
    description:
      "Proposes swapping exercises of one of the user's workouts, which the user applies or keeps as it is; it changes nothing itself. The change is permanent and counts from today. Take the workout and its exercise ids from get_workouts, and the new exercises' ids from search_exercises.",
    args: z.object({
      workoutId: z.number().int().positive(),
      swaps: z
        .array(
          z.object({
            replace: z.string().min(1).describe('The id of the exercise in the workout.'),
            with: z.string().min(1).describe("The new exercise's id."),
            sets: z.number().int().min(1).max(10),
            target: z
              .object({
                reps: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }),
                seconds: z.number().int().min(1),
                meters: z.number().int().min(1),
              })
              .partial()
              .describe(
                'Reps for an exercise counted in reps, seconds for a timed one, meters for a distance.',
              ),
            why: WHY,
          }),
        )
        .min(1)
        .max(5),
    }),
    run: async ({ workoutId, swaps }, { supabase, language, today, threadId }) => {
      const found = await workoutForCard(supabase, workoutId);
      if (found.error) throw found.error;
      const workout = found.data;
      if (!workout) return { error: REFUSALS.BB006 };
      // Named before proposing, which also finds an id that does not exist, so that a proposal is
      // never left without its card.
      const names = await exerciseNames(
        supabase,
        language,
        swaps.flatMap((swap) => [swap.replace, swap.with]),
      );
      const unknown = swaps.find((swap) => !names.has(swap.with));
      if (unknown)
        return { error: `There is no exercise ${unknown.with}; find it with search_exercises.` };
      const proposed = await supabase.rpc('propose_coach_swaps', {
        thread_id: threadId,
        workout_id: workoutId,
        swaps: swaps.map(({ replace, with: put, sets, target }) => ({
          replace,
          with: put,
          sets,
          target,
        })),
        today,
      });
      if (proposed.error) return refused(proposed.error);
      const proposal: ProposalCard = {
        kind: 'workout',
        id: proposed.data,
        workout: { name: workout.name, type: workout.type },
        swaps: swaps.map((swap) => ({
          from: names.get(swap.replace) ?? swap.replace,
          to: names.get(swap.with)!,
          sets: swap.sets,
          target: swap.target,
          why: swap.why,
        })),
      };
      return { proposal };
    },
  }),
  tool({
    name: 'propose_targets_change',
    description:
      "Proposes new daily calories and macros as the user's own targets, which the user applies or keeps as they are; it changes nothing itself. They count from today. Never under the calorie floor, and protein × 4 + carbs × 4 + fat × 9 must not exceed the calories.",
    args: z.object({
      calories: z.number().int().min(800).max(6000),
      proteinG: z.number().int().min(0),
      carbsG: z.number().int().min(0),
      fatG: z.number().int().min(0),
    }),
    run: async (targets, { supabase, today, threadId }) => {
      const [current, proposed] = await Promise.all([
        supabase.rpc('my_nutrition_targets'),
        supabase.rpc('propose_coach_change', {
          thread_id: threadId,
          kind: 'targets',
          change: targets,
          today,
        }),
      ]);
      if (proposed.error) return refused(proposed.error);
      // The targets in use, as the user sees them now; none before the onboarding is saved, and
      // left out when they cannot be read, so that the card does not say there were none.
      if (current.error) logError('Could not read the targets in use for a card', current.error);
      const now = current.data;
      const from: DayTargets<number | null> | null | undefined = current.error
        ? undefined
        : now?.calories != null
          ? {
              calories: now.calories,
              proteinG: now.protein_g,
              carbsG: now.carbs_g,
              fatG: now.fat_g,
            }
          : null;
      const proposal: ProposalCard = {
        kind: 'targets',
        id: proposed.data,
        ...(from !== undefined && { from }),
        to: targets,
      };
      return { proposal };
    },
  }),
  tool({
    name: 'log_meal_card',
    description:
      'Shows the user a card of a meal they ate, which they add to their food log with a tap; it logs nothing itself. Each item is matched to the food library by its searchName, as a meal photo in the app is.',
    args: z.object({
      meal: z
        .enum(Constants.public.Enums.meal)
        .optional()
        .describe('The meal the user named; leave it out otherwise, and the time of day decides.'),
      day: DAY.optional().describe(
        `The day it was eaten, YYYY-MM-DD, today or up to ${MEAL_DAYS_BACK} days back; today when left out.`,
      ),
      items: z.array(ModelItem).min(1).max(MAX_ESTIMATE_ITEMS),
      note: z
        .string()
        .trim()
        .max(200)
        .optional()
        .catch(undefined)
        .describe("One short line about the meal, in the user's language; never judge it."),
    }),
    run: async ({ meal, day, items, note }, { supabase, language, today, threadId, localTime }) => {
      const eatenOn = day ?? today;
      if (eatenOn > today || eatenOn < addDays(today, -MEAL_DAYS_BACK)) {
        return { error: MEAL_REFUSALS.BB020 };
      }
      // As the user, so that only their own foods are found.
      const matched = await matchItems(supabase, language, items);
      const eaten = meal ?? mealAt(localTime);
      const added = await supabase.rpc('add_coach_meal_card', {
        thread_id: threadId,
        day: eatenOn,
        meal: eaten,
        items: matched.map(logItem),
      });
      if (added.error) return refused(added.error, MEAL_REFUSALS);
      const mealCard: MealCard = {
        id: added.data,
        day: eatenOn,
        meal: eaten,
        items: matched,
        ...(note && { note }),
      };
      return { mealCard };
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

/** The user's active workouts with their exercises in order, as row level security lets them. */
function planWorkouts(supabase: Client) {
  return supabase
    .from('workouts')
    .select(
      'id, name, type, weekdays, workout_exercises (exercise_id, sets, target_reps_min, target_reps_max, target_seconds, target_meters, position)',
    )
    .eq('active', true)
    .order('id')
    .order('position', { referencedTable: 'workout_exercises' });
}

/** One of the user's active workouts, by its id, with what its card names it by. */
function workoutForCard(supabase: Client, id: number) {
  return supabase
    .from('workouts')
    .select('id, name, type')
    .eq('active', true)
    .eq('id', id)
    .maybeSingle();
}

/**
 * An exercise's target as save_workout() takes it. As saved_workout() reads it in the database
 * (20261030230000_coach_proposals.sql): change both together.
 */
function targetOf(e: {
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_seconds: number | null;
  target_meters: number | null;
}): { reps?: { min: number; max?: number }; seconds?: number; meters?: number } {
  return {
    ...(e.target_reps_min !== null && {
      reps: {
        min: e.target_reps_min,
        ...(e.target_reps_max !== null && { max: e.target_reps_max }),
      },
    }),
    ...(e.target_seconds !== null && { seconds: e.target_seconds }),
    ...(e.target_meters !== null && { meters: e.target_meters }),
  };
}

/** A proposal or a meal card the database refused, said so that the model can correct it. */
function refused(error: { code?: string; message?: string }, meanings = REFUSALS) {
  const meaning = error.code ? meanings[error.code] : undefined;
  if (!meaning) logError('A proposal or a meal card could not be made', error);
  return { error: meaning ?? 'That could not be done just now.' };
}
