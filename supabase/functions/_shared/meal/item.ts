// An item of a meal as the model gives it (#299, ADR 0059), shared by estimate-meal and the coach
// chat, so that a meal from photos is checked alike wherever it is estimated.
import { z } from 'zod';

import { FOOD_QUERY_LENGTH } from '../foods.ts';
import { type Language, LANGUAGE_NAMES } from '../prompt.ts';

/** The longest name of an item, which a longer one is cut to. */
const MAX_NAME_LENGTH = 100;

/**
 * An item of a meal as the model answers it; anything else is not used. As Gemini does not keep to
 * string lengths, a field that only says too much is cut or dropped rather than failing the whole
 * answer.
 */
export const ModelItem = z.object({
  name: z.preprocess(
    (name) => (typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : name),
    z.string().min(1).max(MAX_NAME_LENGTH),
  ),
  // A longer name finds nothing; its item is estimated rather than the answer lost.
  searchName: z.string().trim().max(FOOD_QUERY_LENGTH.max).catch(''),
  // A garnish of almost nothing is taken as 1 g.
  grams: z.number().min(0).max(5000),
  confidence: z.number().min(0).max(1),
  per100: z.object({
    kcal: z.number().min(0).max(900),
    proteinG: z.number().min(0).max(100),
    carbsG: z.number().min(0).max(100),
    fatG: z.number().min(0).max(100),
  }),
  note: z.string().trim().max(200).optional().catch(undefined),
});

export type ModelItem = z.infer<typeof ModelItem>;

/**
 * How the food library names foods, per language: names it has, and the words it uses for how a
 * food is prepared, which the model is asked to keep to, so that its search names find the foods
 * and an item saved as the user's own food is named in their language (ADR 0060).
 */
export const SEARCH_NAMES: Record<Language, { examples: string[]; preparations: string }> = {
  en: {
    examples: ['Pasta, boiled', 'Chicken breast, grilled'],
    preparations: 'boiled for anything cooked in water, then fried, grilled, roasted or raw',
  },
  de: {
    examples: ['Nudeln, gekocht', 'Hähnchenbrustfilet, gegrillt'],
    preparations: 'gekocht for anything cooked in water, then gebraten, gegrillt or roh',
  },
  tr: {
    examples: ['Makarna, haşlanmış', 'Tavuk göğsü, ızgara'],
    preparations:
      'haşlanmış for anything cooked in water, then tavada or kızarmış, ızgara, fırında or çiğ',
  },
};

/** The lines of a prompt that teach the model those names, one per language. */
export const searchNameLines = Object.entries(SEARCH_NAMES)
  .map(
    ([language, { examples, preparations }]) =>
      `  - ${LANGUAGE_NAMES[language as Language]}: such as ${examples.map((name) => `"${name}"`).join(' or ')}; ${preparations}.`,
  )
  .join('\n');
