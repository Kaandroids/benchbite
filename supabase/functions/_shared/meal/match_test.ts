import { assertEquals } from '@std/assert';

import { bestMatch } from './match.ts';
import { type Food, food } from './test-foods.ts';

Deno.test("prefers the user's own food or recipe when it is the same food", () => {
  const library = food({ food_id: 'F1', name: 'Banana' }, 93);
  const mine = food({ custom_food_id: 7, name: 'Banana, mine' }, 95);
  const bread = food({ recipe_id: 3, name: 'Banana bread' }, 330);
  const bowl = food({ recipe_id: 4, name: 'Rice bowl' }, 130);
  const rice = food({ food_id: 'C352032', name: 'Rice, boiled' }, 117);

  assertEquals(bestMatch('Banana', 90, [library, mine]), mine);
  assertEquals(bestMatch('Banana', 90, [mine, library]), mine);
  const big = food({ recipe_id: 5, name: 'Rice, boiled (big)' }, 120);
  assertEquals(bestMatch('Rice, boiled', 130, [rice, big]), big);
  // Another food that starts with the name is not the user's banana, whatever its calories.
  assertEquals(bestMatch('Banana', 90, [bread, library]), library);
  assertEquals(bestMatch('Banana', 320, [bread]), undefined);
  assertEquals(bestMatch('Rice', 130, [bowl, rice]), rice);
  // Nor is the user's food when its calories are far from the photo's.
  const heavy = food({ custom_food_id: 8, name: 'Banana, fried' }, 250);
  assertEquals(bestMatch('Banana', 90, [heavy, library]), library);
  // But an own food of exactly the name is the one an estimated item would be logged as.
  const exactOwn = food({ custom_food_id: 9, name: 'banana' }, 250);
  assertEquals(bestMatch('Banana', 90, [library, exactOwn]), exactOwn);
  // A recipe of the name is not, unless its calories agree.
  const recipe = food({ recipe_id: 6, name: 'Banana' }, 250);
  assertEquals(bestMatch('Banana', 90, [recipe, library]), library);
});

Deno.test('takes a library food only by its name and calories', () => {
  const raw = food({ food_id: 'E4000', name: 'Pasta, raw' }, 346);
  const boiled = food({ food_id: 'E4010', name: 'Pasta, boiled' }, 146);
  // "Pasta, cooked" is neither by name; "Pasta" is the raw one by name, but not by calories.
  assertEquals(bestMatch('Pasta, cooked', 150, [raw, boiled]), undefined);
  assertEquals(bestMatch('Pasta', 150, [raw, boiled]), boiled);
  assertEquals(bestMatch('Pasta', 150, [raw]), undefined);

  // Holding the letters is not the name: "Ei" in "Schweinekotelett".
  const chop = food({ food_id: 'V1', name: 'Schweinekotelett, gebraten' }, 230);
  assertEquals(bestMatch('Ei, gebraten', 200, [chop]), undefined);

  // Rice cakes are not rice, by name or by calories.
  const cakes = food({ food_id: 'C5', name: 'Rice cakes' }, 371);
  assertEquals(bestMatch('Rice, cooked', 130, [cakes]), undefined);
  assertEquals(bestMatch('Rice', 130, [cakes]), undefined);

  // A name only alike is no match.
  assertEquals(
    bestMatch('Boiled rice', 144, [food({ food_id: 'E1', name: 'Egg, boiled' })]),
    undefined,
  );
  // An exact name decides: an apple far from the photo's calories is no match, and apple sauce,
  // which agrees, is another food.
  const apple = food({ food_id: 'F1', name: 'Apple' }, 58);
  const appleSauce = food({ food_id: 'F2', name: 'Apple sauce' }, 86);
  assertEquals(bestMatch('Apple', 90, [apple, appleSauce]), undefined);
  assertEquals(bestMatch('Apple', 60, [appleSauce, apple]), apple);
  // Small values agree within a few kcal, whatever the ratio.
  const coffee = food({ food_id: 'P1', name: 'Coffee, black' }, 2);
  assertEquals(bestMatch('Coffee, black', 5, [coffee]), coffee);
  // Turkish dotted and dotless i compare as search_foods() does.
  const pilav = food({ food_id: 'X1', name: 'Pirinç pilavı' }, 167);
  assertEquals(bestMatch('PİRİNÇ PİLAVI', 160, [pilav]), pilav);
});
