// What Bite may look up while it answers (#292, ADR 0052): the user's training, meals, weeks,
// records and plan, and the food and exercise libraries; the changes it may propose, which the
// user applies (ADR 0058), to the food log too (ADR 0068); the meals it estimates, as cards the
// user adds (ADR 0062); and the notes it keeps about the user (ADR 0071). Each tool runs with the
// user's token, so row level security and the database's functions decide what it sees and may
// do, and returns little, to keep the answer cheap.
import { z } from 'zod';

import type {
  CardNote,
  CoachToolName,
  DayTargets,
  ExerciseChanges,
  FoodLogChange,
  FoodLogEntry,
  MealCard,
  NoteCard,
  ProposalCard,
  ProposalTarget,
} from '../_shared/coach/chat.ts';
import { Constants } from '../_shared/database.types.ts';
import { FOOD_QUERY_LENGTH } from '../_shared/foods.ts';
import type { Tool } from '../_shared/llm/mod.ts';
import { MAX_ESTIMATE_ITEMS } from '../_shared/meal/estimate.ts';
import { ModelItem } from '../_shared/meal/item.ts';
import { LOGGABLE_DAYS } from '../_shared/meal/limits.ts';
import { logItemOf } from '../_shared/meal/log.ts';
import { matchItems } from '../_shared/meal/match.ts';
import type { Language } from '../_shared/prompt.ts';
import { type Client, logError } from '../_shared/supabase.ts';
import { addDays, DAY, daysBetween } from './day.ts';
import { mealAt } from './meal_card.ts';
import { alternativeName, workoutName } from './workout.ts';

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
  /**
   * Whether the user's message has words. A photo alone never asks for a change to the food log,
   * whatever text it shows.
   */
  hasText: boolean;
  /** Whether the user lets Bite save notes from chats, as the snapshot read it; unknown asks. */
  savesNotes?: boolean;
};

/** The most days one look at the history may cover. */
const MAX_DAYS = 31;

/** The shortest a search may be. */
const QUERY_MIN = 2;

const QUERY = z.string().trim().min(QUERY_MIN).max(80);

/**
 * How many exercises a search gives, and how many of the library's it ranks them from: enough
 * for a common word, as "press" matches about a hundred.
 */
const SEARCH_LIMIT = 10;
const SEARCH_ROWS = 100;

/** How many exercises one search may look for, as a change to several workouts needs several. */
const SEARCH_QUERIES = 5;

/** A food name, as long as search_foods() searches. */
const FOOD_QUERY = z.string().trim().min(FOOD_QUERY_LENGTH.min).max(FOOD_QUERY_LENGTH.max);

/** Why Bite proposes a change, in the user's language, as the card shows it. */
const WHY = z.string().trim().min(1).max(120);

/** An exercise's target, as save_workout() takes it. */
const TARGET = z
  .object({
    reps: z.object({
      min: z.number().int().min(1),
      max: z.number().int().min(1),
    }),
    seconds: z.number().int().min(1),
    meters: z.number().int().min(1),
  })
  .partial()
  .describe(
    'Reps for an exercise counted in reps, seconds for a timed one, meters for a distance.',
  );

const SETS = z.number().int().min(1).max(10);

/**
 * What a change does to a workout's exercises (edited_workout_exercises()): exercises swapped in
 * place, removed, and added at the end, each with why.
 */
const EDIT = {
  swaps: z
    .array(
      z.object({
        replace: z.string().min(1).describe('The id of the exercise in the workout.'),
        with: z.string().min(1).describe("The new exercise's id."),
        sets: SETS,
        target: TARGET,
        why: WHY,
      }),
    )
    .max(5)
    .optional(),
  remove: z
    .array(
      z.object({
        exerciseId: z.string().min(1).describe('The id of the exercise in the workout.'),
        why: WHY,
      }),
    )
    .max(5)
    .optional(),
  add: z
    .array(
      z.object({
        exerciseId: z.string().min(1).describe("The new exercise's id."),
        sets: SETS,
        target: TARGET,
        why: WHY,
      }),
    )
    .max(5)
    .optional(),
};

type Edit = z.infer<z.ZodObject<typeof EDIT>>;

/** The longest alternative name, as workout_alternatives' check allows and the app's chips show. */
const ALTERNATIVE_NAME_LENGTH = 12;

const ALTERNATIVE_NAME = z.string().trim().min(1).max(ALTERNATIVE_NAME_LENGTH);

/**
 * What the database's refusals mean, by their code, for the model to correct what it sent; what
 * it is told of any other refusal; and what is logged then.
 */
type Refusals = { meanings: Record<string, string>; otherwise: string; log: string };

/** The database's refusals of a proposal. */
const REFUSALS = {
  meanings: {
    BB006: "That workout is not the user's.",
    BB007:
      'A target does not suit its exercise: give each new exercise the target search_exercises names for it.',
    BB008: 'A workout needs at least one exercise, and may have only so many.',
    BB037: "The calories are under the user's calorie floor.",
    BB038: 'The user has too many changes waiting; ask them to decide those first.',
    BB039: 'An exercise to replace or remove is not in the workout; take it from get_workouts.',
    BB040:
      'An exercise may be changed once, and one put in may not be in the workout already, nor be one taken out.',
    BB041:
      'The workout has as many alternatives as it may have; switch to one with propose_alternative_switch, or change the workout.',
    BB049:
      'The workout has an alternative of that name already; switch to it with propose_alternative_switch, or pick another name.',
    BB050: 'That alternative is in use already.',
    BB051:
      'That workout or alternative waits for premium: the user can only delete it, or get premium to use it again.',
    BB052:
      'The user has added as many alternatives as their plan allows; they can delete one, or get premium for more.',
    P0002: 'There is no such alternative; take its id from get_workouts.',
    '22023':
      'A change must change something, name each workout once, with all of its changes, and leave a new alternative at least one exercise.',
    '23514': 'The values are out of range, or the macros add up to more than the calories.',
  },
  otherwise: 'The change could not be proposed just now.',
  log: 'A proposal could not be made',
} satisfies Refusals;

/** The most entries one food log proposal changes, as food_log_change() allows. */
export const MAX_FOOD_LOG_CHANGES = 10;

const MEAL = z.enum(Constants.public.Enums.meal);

/** The database's refusals of a food log proposal. */
const FOOD_LOG_REFUSALS = {
  meanings: {
    BB020: `Meals are logged for today and up to ${LOGGABLE_DAYS} days back; an entry on another day, or moved to one, cannot be changed.`,
    BB038: REFUSALS.meanings.BB038,
    BB044: "An entry is not in the user's food log; take the ids from get_meal_log.",
    BB045: 'Each entry may be changed once in a proposal; give all its changes together.',
    '22023': 'Each change must change its entry: another day, meal or grams, or its removal.',
    '23514': 'The grams are out of range.',
  },
  otherwise: 'The change could not be proposed just now.',
  log: 'A food log proposal could not be made',
} satisfies Refusals;

/** The user may save no more foods of their own, which an item the library lacks needs. */
const NO_MORE_OWN_FOODS =
  'The user has as many foods of their own as they may have, so an item the library does not have cannot be saved; tell them.';

/** The database's refusals of a meal card. */
const MEAL_REFUSALS = {
  meanings: {
    BB020: `Meals are logged for today and up to ${LOGGABLE_DAYS} days back.`,
    BB021: 'That day has as many entries as it may have.',
    BB024: NO_MORE_OWN_FOODS,
    BB026: NO_MORE_OWN_FOODS,
    BB038: 'The user has had too many meal cards today; ask them to log it in Nutrition.',
    '23514': 'A value is out of range.',
  },
  otherwise: 'The meal card could not be made just now.',
  log: 'A meal card could not be made',
} satisfies Refusals;

/** The longest a note and the reason it was archived may be, as `coach_notes` checks them. */
const MAX_NOTE_LENGTH = 200;

/** The database's refusals of a note. */
const NOTE_REFUSALS = {
  meanings: {
    BB046:
      'The notebook has as many notes in use as it may: change or archive one that no longer holds instead, or tell the user.',
    BB047:
      'The notebook keeps as many notes as it may; tell the user they can remove past ones in it.',
    BB048:
      'As many notes as may be wait for the user to say yes on their cards; ask for no more until they decide.',
    '23514': `A note has text, of up to ${MAX_NOTE_LENGTH} characters, and an archived one says why.`,
  },
  otherwise: 'The note could not be kept just now.',
  log: 'A note could not be kept',
} satisfies Refusals;

/** What Bite is told of a note it cannot change. */
const NO_NOTE = 'There is no such note in use; take its id from the snapshot.';

/** Why a change to a note could not be proposed. */
const NOTE_PROPOSAL_REFUSALS = {
  meanings: {
    BB038: REFUSALS.meanings.BB038,
    P0002: NO_NOTE,
    '23514': NOTE_REFUSALS.meanings['23514'],
  },
  otherwise: 'The change could not be proposed just now.',
  log: 'A note change could not be proposed',
} satisfies Refusals;

const NOTE_ID = z.number().int().positive().describe("The note's id, as the snapshot lists it.");
const NOTE_CATEGORY = z.enum(Constants.public.Enums.coach_note_category);
const NOTE_TEXT = z
  .string()
  .trim()
  .min(1)
  .max(MAX_NOTE_LENGTH)
  .describe("One fact, in the user's language, as they would say it: 'Allergic to walnuts'.");

/** The longest Bite waits to ask again whether a note still holds. */
const MAX_REVIEW_DAYS = 180;

/** Why a day to ask again on is refused: one is after today and within `MAX_REVIEW_DAYS`. */
function reviewRefusal(day: string | null | undefined, today: string) {
  if (!day) return undefined;
  return day > today && day <= addDays(today, MAX_REVIEW_DAYS)
    ? undefined
    : { error: `A day to ask again is after today and within ${MAX_REVIEW_DAYS} days.` };
}

const NOTE_COLUMNS = 'id, category, text';

type CoachTool<A extends z.ZodType> = {
  /** One of the names the app knows (`COACH_TOOLS`), which it says what Bite is doing by. */
  name: CoachToolName;
  /** The kind of proposal it makes, if it proposes a change, whose card the app must show. */
  proposes?: ProposalCard['kind'];
  description: string;
  /** The arguments, which the model is told of and its calls are checked against. */
  args: A;
  run: (args: z.infer<A>, context: ToolContext) => Promise<unknown>;
};

/**
 * A tool with a way to call it with arguments not checked yet, checked against its own schema,
 * so that a list of tools of different arguments calls each without a cast. Arguments that are
 * wrong say so in the result, for the model to correct.
 */
const tool = <A extends z.ZodType>(definition: CoachTool<A>) => ({
  ...definition,
  call: (args: unknown, context: ToolContext): Promise<unknown> => {
    const parsed = definition.args.safeParse(args);
    if (!parsed.success) return Promise.resolve({ error: z.prettifyError(parsed.error) });
    return definition.run(parsed.data, context);
  },
});

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
    description:
      "What the user ate on one day, meal by meal, with each entry's id, its food's grams and macros.",
    args: z.object({ day: DAY.describe('The day, YYYY-MM-DD.') }),
    run: async ({ day }, { supabase, language }) => {
      const entries = read(
        await supabase
          .from('meal_entries')
          .select(`id, meal, grams, kcal, protein_g, carbs_g, fat_g, ${ENTRY_FOOD}`)
          .eq('day', day)
          .order('created_at'),
      );
      const name = await entryNames(supabase, language, entries);
      return entries.map((entry) => ({
        id: entry.id,
        meal: entry.meal,
        food: name(entry),
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
    description: `Exercises in the library and the user's own whose name matches each query, up to ${SEARCH_QUERIES} queries at once, each with the target it takes: reps, seconds, or meters or seconds. Search for every exercise you need in one call.`,
    args: z.object({
      queries: z
        .array(QUERY.describe('An exercise name, such as "squat".'))
        .min(1)
        .max(SEARCH_QUERIES),
    }),
    run: ({ queries }, { supabase, language }) =>
      Promise.all(
        distinctQueries(queries).map(async (query) => {
          const found = await searchExercises(supabase, language, query);
          // A plural finds nothing in names that are singular, as "Sissy Squat" for "sissy
          // squats": it is searched once more without its last s.
          const singular = query.length > QUERY_MIN && /s$/i.test(query);
          return {
            query,
            exercises:
              found.length || !singular
                ? found
                : await searchExercises(supabase, language, query.slice(0, -1)),
          };
        }),
      ),
  }),
  tool({
    name: 'get_workouts',
    description:
      "The user's active workouts: each one's id, name, weekdays (1 Monday to 7 Sunday) and exercises in use, with their ids, sets and targets; and a workout's alternatives, if it has any (other versions of it, as one for the gym and one for home), each with its id, name, whether it is in use, and the exercises of those not in use.",
    args: z.object({}),
    run: async (_args, { supabase, language }) => {
      const workouts = read(await planWorkouts(supabase));
      const names = await exerciseNames(supabase, language, [
        ...workouts.flatMap((w) => w.workout_exercises.map((e) => e.exercise_id)),
        ...workouts.flatMap((w) =>
          w.workout_alternatives.flatMap((a) => kept(a.exercises).map((e) => e.exerciseId)),
        ),
      ]);
      const named = (id: string) => names.get(id) ?? id;
      return workouts.map((workout) => ({
        id: workout.id,
        name: workoutName(workout),
        weekdays: workout.weekdays,
        exercises: workout.workout_exercises.map((e) => ({
          id: e.exercise_id,
          name: named(e.exercise_id),
          sets: e.sets,
          target: targetOf(e),
        })),
        ...(workout.workout_alternatives.length > 0 && {
          alternatives: workout.workout_alternatives.map((a) => ({
            id: a.id,
            name: alternativeName(a),
            inUse: a.in_use,
            ...(!a.in_use && {
              exercises: kept(a.exercises).map((e) => ({
                id: e.exerciseId,
                name: named(e.exerciseId),
                sets: e.sets,
                target: e.target,
              })),
            }),
          })),
        }),
      }));
    },
  }),
  tool({
    name: 'propose_workout_change',
    proposes: 'workouts',
    description:
      "Proposes lasting changes to 1 to 3 of the user's workouts in one card: exercises swapped in place, removed, or added at the end, the rest of each workout as it is. The user applies all of it or keeps things as they are; it changes nothing itself. It counts from today, for good, and changes the alternative in use. Take the workouts and their exercise ids from get_workouts, and new exercises' ids from search_exercises.",
    args: z.object({
      workouts: z
        .array(z.object({ workoutId: z.number().int().positive(), ...EDIT }))
        .min(1)
        .max(3)
        .refine((edits) => new Set(edits.map((e) => e.workoutId)).size === edits.length, {
          message: 'name each workout once, with all of its changes',
        }),
    }),
    run: async ({ workouts: edits }, { supabase, language, today, threadId }) => {
      const found = read(
        await supabase
          .from('workouts')
          .select('id, name, type, weekdays')
          .eq('active', true)
          .in(
            'id',
            edits.map((edit) => edit.workoutId),
          ),
      );
      const changed = edits.map((edit) => found.find((w) => w.id === edit.workoutId));
      if (changed.some((workout) => !workout)) {
        return { error: REFUSALS.meanings.BB006 };
      }
      const names = await editNames(supabase, language, edits);
      if (typeof names === 'string') return { error: names };
      const proposed = await supabase.rpc('propose_coach_workouts', {
        thread_id: threadId,
        edits: edits.map((edit) => ({
          workoutId: edit.workoutId,
          ...editOf(edit),
        })),
        today,
      });
      if (proposed.error) return refused(proposed.error, REFUSALS);
      const proposal: ProposalCard = {
        kind: 'workouts',
        id: proposed.data,
        workouts: edits.map((edit, index) => {
          const workout = changed[index]!;
          return {
            workout: { name: workout.name, type: workout.type },
            weekdays: workout.weekdays,
            ...changesOf(edit, names),
          };
        }),
      };
      return { proposal };
    },
  }),
  tool({
    name: 'propose_alternative',
    proposes: 'alternative',
    description: `Proposes a new alternative of one of the user's workouts for a while, as for pain, an injury, travel or a gym closed: the version in use with exercises swapped, removed or added, put in use when the user applies it. The workout's other alternatives stay as they are, to switch back to. It changes nothing itself. Name it in the user's language, in at most ${ALTERNATIVE_NAME_LENGTH} characters, as no alternative of the workout is named. When the workout has no alternatives yet, name the version in use now too (currentName), as Gym. Take the ids as for propose_workout_change`,
    args: z.object({
      workoutId: z.number().int().positive(),
      name: ALTERNATIVE_NAME.describe("The new alternative's name, as Knee-safe or Hotel."),
      currentName: ALTERNATIVE_NAME.optional().describe(
        'A name for the version in use now, when it has none.',
      ),
      ...EDIT,
    }),
    run: async (args, { supabase, language, today, threadId }) => {
      const found = await workoutForCard(supabase, args.workoutId);
      if (found.error) throw found.error;
      const workout = found.data;
      if (!workout) return { error: REFUSALS.meanings.BB006 };
      const names = await editNames(supabase, language, [args]);
      if (typeof names === 'string') return { error: names };
      const proposed = await supabase.rpc('propose_coach_alternative', {
        thread_id: threadId,
        workout_id: args.workoutId,
        name: args.name,
        // None is blank, which the database leaves out, as it does for a version in use that
        // has a name.
        current_name: args.currentName ?? '',
        edit: editOf(args),
        today,
      });
      if (proposed.error) return refused(proposed.error, REFUSALS);
      // The alternative it is made from, as applying names it, which the database gives.
      const made = proposed.data as Pick<AlternativeCard, 'id' | 'from'>;
      const proposal: ProposalCard = {
        kind: 'alternative',
        id: made.id,
        workout: { name: workout.name, type: workout.type },
        from: made.from,
        to: args.name,
        ...changesOf(args, names),
      };
      return { proposal };
    },
  }),
  tool({
    name: 'propose_alternative_switch',
    proposes: 'alternative_switch',
    description:
      "Proposes putting another alternative of one of the user's workouts in use, as the usual one again once the user is better. The one in use now is kept, to switch to again. It changes nothing itself. Take the alternative's id from get_workouts.",
    args: z.object({ alternativeId: z.number().int().positive() }),
    run: async ({ alternativeId }, { supabase, language, today, threadId }) => {
      const found = await supabase
        .from('workout_alternatives')
        .select('exercises, workouts!inner (name, type)')
        .eq('id', alternativeId)
        .eq('workouts.active', true)
        .maybeSingle();
      if (found.error) throw found.error;
      const next = found.data;
      if (!next) return { error: REFUSALS.meanings.P0002 };
      const workout = next.workouts;
      // Named before proposing, so that a proposal is never left without its card: the exercises
      // that may come back are the alternative's.
      const names = await exerciseNames(
        supabase,
        language,
        kept(next.exercises).map((e) => e.exerciseId),
      );
      const proposed = await supabase.rpc('propose_coach_alternative_switch', {
        thread_id: threadId,
        alternative_id: alternativeId,
        today,
      });
      if (proposed.error) return refused(proposed.error, REFUSALS);
      // What applying switches between, as the database read it for the proposal.
      // The exercises that come back by their ids, which the card names.
      const made = proposed.data as Omit<SwitchCard, 'kind' | 'workout'>;
      const proposal: ProposalCard = {
        kind: 'alternative_switch',
        id: made.id,
        workout: { name: workout.name, type: workout.type },
        from: made.from,
        to: made.to,
        back: made.back.map((id) => names.get(id) ?? id),
        empty: made.empty,
      };
      return { proposal };
    },
  }),
  tool({
    name: 'propose_targets_change',
    proposes: 'targets',
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
      if (proposed.error) return refused(proposed.error, REFUSALS);
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
  // Changes to the food log (ADR 0068), which only the user's words ask for.
  tool({
    name: 'propose_food_log_change',
    proposes: 'food_log',
    description:
      "Proposes changes to entries of the user's food log, which the user applies or keeps as it is; it changes nothing itself. Each change moves an entry to another meal or day, changes its grams, or removes it. Take the entries' ids from get_meal_log.",
    args: z.object({
      changes: z
        .array(
          z
            .object({
              entryId: z.number().int().positive().describe("The entry's id from get_meal_log."),
              day: DAY.optional().describe(
                `The day to move it to, YYYY-MM-DD, today or up to ${LOGGABLE_DAYS} days back.`,
              ),
              meal: MEAL.optional().describe('The meal to move it to.'),
              grams: z.number().positive().max(5000).optional().describe('What the user ate.'),
              remove: z
                .boolean()
                .optional()
                .describe('True when the user did not eat it; then nothing else.'),
            })
            .refine(
              ({ day, meal, grams, remove }) =>
                remove
                  ? day === undefined && meal === undefined && grams === undefined
                  : day !== undefined || meal !== undefined || grams !== undefined,
              {
                message: 'Each change gives a day, a meal or grams, or only remove: true',
              },
            ),
        )
        .min(1)
        .max(MAX_FOOD_LOG_CHANGES)
        .refine((changes) => new Set(changes.map((c) => c.entryId)).size === changes.length, {
          message: 'Each entry once; give all its changes together',
        }),
    }),
    run: async ({ changes }, { supabase, language, today, threadId, hasText }) => {
      if (!hasText) {
        return {
          error:
            'The user asked for no change in words. Ask them what to change; a photo never asks for it.',
        };
      }
      const proposed = await supabase.rpc('propose_coach_change', {
        thread_id: threadId,
        kind: 'food_log',
        change: {
          changes: changes.map(({ entryId, day, meal, grams, remove }) =>
            remove ? { entryId, remove: true } : { entryId, day, meal, grams },
          ),
        },
        today,
      });
      if (proposed.error) return refused(proposed.error, FOOD_LOG_REFUSALS);
      // The card shows what the database kept, which applying sets, rather than what Bite asked for
      // or an entry read before: the entries may have changed meanwhile. The user reads their own
      // proposals and entries.
      const [stored, named] = await Promise.all([
        storedProposal<{ changes: StoredFoodLogChange[] }, StoredFoodLogEntry[]>(
          supabase,
          proposed.data,
        ),
        supabase
          .from('meal_entries')
          .select(`id, ${ENTRY_FOOD}`)
          .in(
            'id',
            changes.map((c) => c.entryId),
          ),
      ]);
      const entries = read(named);
      const name = await entryNames(supabase, language, entries);
      const names = new Map(entries.map((entry) => [entry.id, name(entry)]));
      const { change, before } = stored;
      const proposal: ProposalCard = {
        kind: 'food_log',
        id: proposed.data,
        changes: change.changes.map((c): FoodLogChange => {
          const was = before.find((entry) => entry.id === c.entryId)!;
          return {
            food: names.get(c.entryId) ?? '',
            from: foodLogEntry(was, was),
            ...(!c.remove && { to: foodLogEntry(c, was) }),
          };
        }),
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
        `The day it was eaten, YYYY-MM-DD, today or up to ${LOGGABLE_DAYS} days back; today when left out.`,
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
      if (eatenOn > today || eatenOn < addDays(today, -LOGGABLE_DAYS)) {
        return { error: MEAL_REFUSALS.meanings.BB020 };
      }
      // As the user, so that only their own foods are found.
      const matched = await matchItems(supabase, language, items);
      const eaten = meal ?? mealAt(localTime);
      const added = await supabase.rpc('add_coach_meal_card', {
        thread_id: threadId,
        day: eatenOn,
        meal: eaten,
        items: matched.map(logItemOf),
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
  tool({
    name: 'save_note',
    description:
      "Saves a lasting fact about the user to Bite's notebook, which every answer then reads: an allergy, a health condition, an injury, their gear or training, food they eat or avoid, a goal, their routine. When the user has saving from chats off, it asks them first with a card.",
    args: z.object({
      category: NOTE_CATEGORY,
      text: NOTE_TEXT,
      reviewOn: DAY.optional().describe(
        'For what may pass, as an injury: the day to ask again whether it still holds, YYYY-MM-DD.',
      ),
    }),
    run: async ({ category, text, reviewOn }, { supabase, today, threadId, savesNotes }) => {
      const wrongDay = reviewRefusal(reviewOn, today);
      if (wrongDay) return wrongDay;
      // A note the notebook holds already, in use or waiting for the user's yes, is not saved
      // again: Bite does so now and then, though told not to.
      const held = await supabase
        .from('coach_notes')
        .select('id')
        .is('archived_at', null)
        .ilike(
          'text',
          text.replace(/[\\%_]/g, (c) => `\\${c}`),
        )
        .limit(1)
        .maybeSingle();
      if (held.error) return refused(held.error, NOTE_REFUSALS);
      if (held.data) return { error: `The notebook holds this already, as #${held.data.id}.` };
      // As the snapshot told Bite; unknown, it asks first: a note is never kept against the
      // user's choice.
      const asked = savesNotes !== true;
      const saved = await supabase
        .from('coach_notes')
        .insert({
          category,
          text,
          source: 'chat',
          thread_id: threadId,
          asked,
          review_on: reviewOn ?? null,
        })
        .select(NOTE_COLUMNS)
        .single();
      if (saved.error) return refused(saved.error, NOTE_REFUSALS);
      const note: NoteCard = { ...saved.data, action: asked ? 'asked' : 'saved' };
      return { note };
    },
  }),
  tool({
    name: 'update_note',
    proposes: 'note',
    description:
      'Proposes changing a note in the notebook that no longer says it right, as when the user corrects it or an injury is better but not gone, or moving or clearing the day to ask again. The user applies it on its card; it changes nothing itself.',
    args: z
      .object({
        id: NOTE_ID,
        category: NOTE_CATEGORY.optional(),
        text: NOTE_TEXT.optional(),
        reviewOn: DAY.nullable()
          .optional()
          .describe('The new day to ask again, YYYY-MM-DD, or null for none.'),
      })
      .refine((args) => args.category || args.text || args.reviewOn !== undefined, {
        message: 'Give what to change: the category, the text or the day to ask again.',
      }),
    run: async ({ id, category, text, reviewOn }, { supabase, today, threadId }) => {
      const wrongDay = reviewRefusal(reviewOn, today);
      if (wrongDay) return wrongDay;
      const change = {
        id,
        ...(category && { category }),
        ...(text && { text }),
        ...(reviewOn !== undefined && { reviewOn }),
      };
      const proposed = await supabase.rpc('propose_coach_change', {
        thread_id: threadId,
        kind: 'note',
        change,
        today,
      });
      if (proposed.error) return refused(proposed.error, NOTE_PROPOSAL_REFUSALS);
      // As the database kept it, which applying sets: with what a proposal it replaced changed.
      const { change: kept, before } = await storedProposal<Partial<CardNote>, CardNote>(
        supabase,
        proposed.data,
      );
      const proposal: ProposalCard = {
        kind: 'note',
        id: proposed.data,
        from: { category: before.category, text: before.text, reviewOn: before.reviewOn },
        to: {
          category: kept.category ?? before.category,
          text: kept.text ?? before.text,
          reviewOn: kept.reviewOn === undefined ? before.reviewOn : kept.reviewOn,
        },
      };
      return { proposal };
    },
  }),
  tool({
    name: 'archive_note',
    proposes: 'note_archive',
    description:
      'Proposes moving a note that no longer holds to past notes, which answers leave out, as an injury that healed or a goal whose date has passed. The user applies it on its card, and can restore the note later; it changes nothing itself.',
    args: z.object({
      id: NOTE_ID,
      reason: z
        .string()
        .trim()
        .min(1)
        .max(MAX_NOTE_LENGTH)
        .describe("Why it no longer holds, in the user's language: 'The knee is fine again'."),
    }),
    run: async ({ id, reason }, { supabase, today, threadId }) => {
      const proposed = await supabase.rpc('propose_coach_change', {
        thread_id: threadId,
        kind: 'note_archive',
        change: { id, reason },
        today,
      });
      if (proposed.error) return refused(proposed.error, NOTE_PROPOSAL_REFUSALS);
      const { before } = await storedProposal<unknown, CardNote>(supabase, proposed.data);
      const proposal: ProposalCard = {
        kind: 'note_archive',
        id: proposed.data,
        category: before.category,
        text: before.text,
        reason,
      };
      return { proposal };
    },
  }),
];

/**
 * The proposal `id` as the database kept it: the change applying sets, and what it replaces, which
 * the user reads as their own proposal.
 */
async function storedProposal<Change, Before>(
  supabase: Client,
  id: number,
): Promise<{ change: Change; before: Before }> {
  const stored = await supabase
    .from('coach_proposals')
    .select('change, before')
    .eq('id', id)
    .single();
  if (stored.error) throw stored.error;
  return stored.data as unknown as { change: Change; before: Before };
}

/** The kinds of proposal the tools offered to Bite make. */
export const PROPOSAL_KINDS = TOOLS.flatMap((t) => (t.proposes ? [t.proposes] : []));

/** The tools that make a card: those that propose a change, and the meal card's. */
export const CARD_TOOLS: string[] = TOOLS.flatMap((t) =>
  t.proposes || t.name === 'log_meal_card' ? [t.name] : [],
);

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
  try {
    return await tool.call(args, context);
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

/** What names an entry's food: a food of the library by its id, or an own food's or recipe's name. */
const ENTRY_FOOD = 'food_id, custom_foods (name), recipes (name)';

type EntryFood = {
  food_id: string | null;
  custom_foods: { name: string } | null;
  recipes: { name: string } | null;
};

/** How to name `entries`' foods: library foods in `language`, else in English, as the app does. */
async function entryNames(supabase: Client, language: Language, entries: EntryFood[]) {
  const ids = entries.flatMap((entry) => (entry.food_id ? [entry.food_id] : []));
  const names = ids.length
    ? inLanguage(
        read(
          await supabase
            .from('food_names')
            .select('food_id, language, name')
            .in('language', [language, 'en'])
            .in('food_id', ids),
        ).map((row) => ({
          id: row.food_id,
          language: row.language,
          name: row.name,
        })),
        language,
      )
    : new Map<string, string>();
  return (entry: EntryFood) =>
    (entry.food_id && names.get(entry.food_id)) ?? entry.custom_foods?.name ?? entry.recipes?.name;
}

/** A change as food_log_change() keeps it, everything filled in. */
type StoredFoodLogChange =
  | { entryId: number; remove: true }
  | { entryId: number; remove?: undefined; day: string; meal: FoodLogEntry['meal']; grams: number };

/** An entry as a proposal's `before` keeps it. */
type StoredFoodLogEntry = {
  id: number;
  day: string;
  meal: FoodLogEntry['meal'];
  grams: number;
  kcal_per_100g: number;
};

/**
 * An entry on `at`'s day and meal and at its grams, with what it adds at `entry`'s values per
 * 100 g, rounded as the entry's own `kcal` is.
 */
function foodLogEntry(
  at: { day: string; meal: FoodLogEntry['meal']; grams: number },
  entry: StoredFoodLogEntry,
): FoodLogEntry {
  return {
    day: at.day,
    meal: at.meal,
    grams: at.grams,
    kcal: Math.round((at.grams * entry.kcal_per_100g) / 10) / 10,
  };
}

/**
 * Exercises' names in `language`, else their own, which is English, as the app names them
 * (`src/exercises/library.ts`).
 */
async function exerciseNames(supabase: Client, language: Language, ids: string[]) {
  return new Map((await exerciseRows(supabase, language, ids)).map((row) => [row.id, row.name]));
}

/** What Bite reads of an exercise's target kind (target_kind()). */
const TARGET_WORDS: Record<string, string> = {
  reps: 'reps',
  distance: 'meters or seconds',
  time: 'seconds',
};

/**
 * The exercises `ids`, each named in `language` where the library has a translation, else by its
 * own name, with the target it takes as Bite reads it.
 */
async function exerciseRows(supabase: Client, language: Language, ids: string[]) {
  if (!ids.length) return [];
  const rows = read(
    await supabase
      .from('exercises')
      .select('id, name, target_kind, exercise_translations (name)')
      .in('id', ids)
      .eq('exercise_translations.language', language),
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.exercise_translations[0]?.name ?? row.name,
    target: row.target_kind ? TARGET_WORDS[row.target_kind] : undefined,
  }));
}

/** `queries` each once, whatever its case, as the search ignores it, in their first spelling. */
function distinctQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const distinct: string[] = [];
  for (const query of queries) {
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(query);
  }
  return distinct;
}

/** How close a name is to what was searched: the name itself, one starting with it, the rest. */
function closeness(name: string, query: string): number {
  const [a, b] = [name.toLowerCase(), query.trim().toLowerCase()];
  return a === b ? 0 : a.startsWith(b) ? 1 : 2;
}

/** An edit as edited_workout_exercises() takes it. */
function editOf({ swaps = [], remove = [], add = [] }: Edit) {
  return {
    swaps: swaps.map(({ replace, with: put, sets, target }) => ({
      replace,
      with: put,
      sets,
      target,
    })),
    remove: remove.map((e) => e.exerciseId),
    add: add.map(({ exerciseId, sets, target }) => ({
      exerciseId,
      sets,
      target,
    })),
  };
}

/**
 * The names of the exercises `edits` name, which also finds a new one that does not exist, so that
 * a proposal is never left without its card; what to tell the model when one does not.
 */
async function editNames(
  supabase: Client,
  language: Language,
  edits: Edit[],
): Promise<Map<string, string> | string> {
  const incoming = edits.flatMap(({ swaps = [], add = [] }) => [
    ...swaps.map((swap) => swap.with),
    ...add.map((e) => e.exerciseId),
  ]);
  const names = await exerciseNames(supabase, language, [
    ...incoming,
    ...edits.flatMap(({ swaps = [], remove = [] }) => [
      ...swaps.map((swap) => swap.replace),
      ...remove.map((e) => e.exerciseId),
    ]),
  ]);
  const unknown = incoming.find((id) => !names.has(id));
  return unknown ? `There is no exercise ${unknown}; find it with search_exercises.` : names;
}

/** What an edit changes, named, as its card shows it. */
function changesOf(
  { swaps = [], remove = [], add = [] }: Edit,
  names: Map<string, string>,
): ExerciseChanges {
  const named = (id: string) => names.get(id) ?? id;
  return {
    swaps: swaps.map((swap) => ({
      from: named(swap.replace),
      to: named(swap.with),
      sets: swap.sets,
      target: swap.target,
      why: swap.why,
    })),
    removed: remove.map((e) => ({ name: named(e.exerciseId), why: e.why })),
    added: add.map((e) => ({
      name: named(e.exerciseId),
      sets: e.sets,
      target: e.target,
      why: e.why,
    })),
  };
}

/** The exercises whose name matches `query`, the user's own first, named in `language`. */
async function searchExercises(supabase: Client, language: Language, query: string) {
  const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  // An exercise's own name is its English one; some of the library have a name in German or
  // Turkish too, which the app shows instead. The user's own are searched apart, so that the
  // library's many matches leave room for them. Translations are of the library only, whose
  // exercises are never archived.
  const exercises = () =>
    supabase.from('exercises').select('id, name').is('archived_at', null).ilike('name', pattern);
  const [own, translated, library] = await Promise.all([
    exercises().not('owner_id', 'is', null).limit(SEARCH_LIMIT),
    supabase
      .from('exercise_translations')
      .select('exercise_id, name')
      .eq('language', language)
      .ilike('name', pattern)
      .limit(SEARCH_ROWS),
    exercises().is('owner_id', null).limit(SEARCH_ROWS),
  ]);
  // The user's own first, then the library's by how close the name they matched by is.
  const ranked = [
    ...read(translated).map((row) => ({ id: row.exercise_id, name: row.name })),
    ...read(library),
  ].sort((a, b) => closeness(a.name, query) - closeness(b.name, query));
  const ids = [
    ...new Set([...read(own).map((row) => row.id), ...ranked.map((row) => row.id)]),
  ].slice(0, SEARCH_LIMIT);
  const found = new Map((await exerciseRows(supabase, language, ids)).map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = found.get(id);
    return row ? [{ id, name: row.name, target: row.target }] : [];
  });
}

/** The user's active workouts with their exercises in order, as row level security lets them. */
function planWorkouts(supabase: Client) {
  return supabase
    .from('workouts')
    .select(
      'id, name, type, weekdays, workout_exercises (exercise_id, sets, target_reps_min, target_reps_max, target_seconds, target_meters, position), workout_alternatives (id, name, position, in_use, exercises)',
    )
    .eq('active', true)
    .order('id')
    .order('position', { referencedTable: 'workout_exercises' })
    .order('position', { referencedTable: 'workout_alternatives' });
}

/** An exercise of an alternative not in use, as saved_workout() kept it (ADR 0061). */
type Kept = { exerciseId: string; sets: number; target: ProposalTarget };

/** The exercises an alternative keeps, none for the one in use. */
function kept(exercises: unknown) {
  return Array.isArray(exercises) ? (exercises as Kept[]) : [];
}

type AlternativeCard = Extract<ProposalCard, { kind: 'alternative' }>;
type SwitchCard = Extract<ProposalCard, { kind: 'alternative_switch' }>;

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

/** What the database refused, said with `refusals` so that the model can correct it. */
function refused(error: { code?: string; message?: string }, refusals: Refusals) {
  const meaning = error.code ? refusals.meanings[error.code] : undefined;
  if (!meaning) logError(refusals.log, error);
  return { error: meaning ?? refusals.otherwise };
}
