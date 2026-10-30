// Foods as search_foods() finds them, for the tests of the matching and of estimate-meal.

export type Food = {
  food_id: string | null;
  custom_food_id: number | null;
  recipe_id: number | null;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  portion_unit: null;
  portion_grams: null;
};

/** A found food of the given name and calories per 100 g, by the id `ref` gives. */
export function food(ref: Partial<Food> & { name: string }, kcal = 100): Food {
  return {
    food_id: null,
    custom_food_id: null,
    recipe_id: null,
    kcal,
    protein_g: 10,
    carbs_g: 20,
    fat_g: 5,
    portion_unit: null,
    portion_grams: null,
    ...ref,
  };
}
