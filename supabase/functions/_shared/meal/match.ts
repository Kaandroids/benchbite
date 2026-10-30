// How the items of a meal the model estimated are looked up in the food library and the user's
// own foods (#299, ADR 0059, ADR 0060), shared by estimate-meal and the coach chat, so that the
// same food comes out at the same values wherever a meal is estimated.
import type { Database } from '../database.types.ts';
import { FOOD_QUERY_LENGTH, foodNameKey, refOfRow } from '../foods.ts';
import type { Language } from '../prompt.ts';
import { type Client, logError } from '../supabase.ts';
import type { EstimateFood, EstimateItem, Per100 } from './estimate.ts';
import type { ModelItem } from './item.ts';

/**
 * A food search_foods() found, by exactly one of its ids, which the generated types do not mark as
 * nullable.
 */
type FoundFood = Pick<
  Database['public']['Functions']['search_foods']['Returns'][number],
  'name' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'
> & { food_id: string | null; custom_food_id: number | null; recipe_id: number | null };

/**
 * The items with the values of the food each matched in the library or the user's own foods and
 * recipes, or the model's own, marked as estimated, for an item that matched none. Each name is
 * searched once, as the user, so that only their own foods are found.
 */
export async function matchItems(
  supabase: Client,
  language: Language,
  items: ModelItem[],
): Promise<EstimateItem[]> {
  const searches = new Map<string, Promise<FoundFood[]>>();
  const search = (query: string) => {
    if (!searches.has(query)) searches.set(query, searchFoods(supabase, language, query));
    return searches.get(query)!;
  };
  return await Promise.all(
    items.map(async (item) => {
      const food = bestMatch(item.searchName, item.per100.kcal, await search(item.searchName));
      return {
        name: item.name,
        searchName: item.searchName || item.name,
        grams: Math.max(1, Math.round(item.grams)),
        confidence: Math.round(item.confidence * 100) / 100,
        ...(food
          ? { food: foodOf(food), per100: per100Of(food), estimated: false }
          : { per100: rounded(item.per100), estimated: true }),
        ...(item.note && { note: item.note }),
      };
    }),
  );
}

/** The foods search_foods() finds, or none when it cannot search; the item is then estimated. */
async function searchFoods(
  supabase: Client,
  language: Language,
  query: string,
): Promise<FoundFood[]> {
  if (query.length < FOOD_QUERY_LENGTH.min || query.length > FOOD_QUERY_LENGTH.max) return [];
  const { data, error } = await supabase.rpc('search_foods', { query, language });
  if (error) {
    logError('Could not search the foods', error);
    return [];
  }
  return data;
}

/**
 * How far a found food's calories per 100 g may be from the model's estimate, relative to the
 * larger, for the food to be taken: a name alone does not tell cooked pasta (about 150 kcal) from
 * dry (about 350), or a dish from its plain food, and taking the wrong one would be far off.
 */
const KCAL_TOLERANCE = 0.35;

/** Within so many kcal per 100 g, values agree whatever the ratio, as for greens or a coffee. */
const KCAL_SLACK = 15;

/** What may follow the food searched for in a library food's name: "Rice, boiled", "Rice (white)". */
const LIBRARY_SEPARATORS = [' ', ','];

/**
 * What may follow it in the user's own food or recipe: "Banana, mine", but not "Banana bread",
 * which is another food.
 */
const OWN_SEPARATORS = [',', ' (', ' -'];

/**
 * The food an item is, of those search_foods() found, or none, when the model's own values are
 * used: one whose name is the name searched for, or starts with it, and whose calories agree
 * with the model's estimate. A food of exactly that name decides: it, or none, as a longer name
 * that agrees where it does not is another food, as apple sauce is to an apple. The user's own
 * food or recipe comes first, when it is the same food; otherwise the library's, best first as
 * search_foods() orders them.
 *
 * An own food of exactly the searched name is taken whatever its calories, as an item with no
 * match is saved and logged by that name, which log_meal_estimate() then finds as that food
 * (ADR 0060): the estimate shows what will be logged.
 */
export function bestMatch(
  searchName: string,
  estimatedKcal: number,
  found: FoundFood[],
): FoundFood | undefined {
  const key = nameKey(searchName);
  if (key.length < FOOD_QUERY_LENGTH.min) return undefined;
  const ownOfName = found.find((row) => row.custom_food_id !== null && nameKey(row.name) === key);
  if (ownOfName) return ownOfName;
  const agrees = (row: FoundFood) => {
    const difference = Math.abs(row.kcal - estimatedKcal);
    return (
      difference <= KCAL_SLACK || difference <= KCAL_TOLERANCE * Math.max(row.kcal, estimatedKcal)
    );
  };
  const pick = (rows: FoundFood[], separators: string[]) => {
    const exact = rows.filter((row) => nameKey(row.name) === key);
    if (exact.length) return exact.find(agrees);
    return rows.find(
      (row) =>
        separators.some((separator) => nameKey(row.name).startsWith(key + separator)) &&
        agrees(row),
    );
  };
  return (
    pick(
      found.filter((row) => row.food_id === null),
      OWN_SEPARATORS,
    ) ??
    pick(
      found.filter((row) => row.food_id !== null),
      LIBRARY_SEPARATORS,
    )
  );
}

/** A name as search_foods() compares it, trimmed. */
function nameKey(name: string): string {
  return foodNameKey(name).trim();
}

/** A found food as a meal entry names it. */
function foodOf(row: FoundFood): EstimateFood {
  return { ref: refOfRow(row), name: row.name };
}

function per100Of(row: FoundFood): Per100 {
  return { kcal: row.kcal, proteinG: row.protein_g, carbsG: row.carbs_g, fatG: row.fat_g };
}

/** The model's values, to a tenth, as the library has them. */
function rounded(values: Per100): Per100 {
  const tenth = (value: number) => Math.round(value * 10) / 10;
  return {
    kcal: tenth(values.kcal),
    proteinG: tenth(values.proteinG),
    carbsG: tenth(values.carbsG),
    fatG: tenth(values.fatG),
  };
}
