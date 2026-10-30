import { assertEquals, assertStringIncludes } from '@std/assert';

import foods from '../../data/foods.json' with { type: 'json' };
import { type Language, LANGUAGES } from '../_shared/prompt.ts';
import { RESPONSE_SCHEMA, SEARCH_NAMES, SYSTEM } from './prompt.ts';

type Schema = { properties: Record<string, Schema>; items: Schema; required?: string[] } & Record<
  string,
  unknown
>;

Deno.test('asks for the answer the check takes, its limits and optional notes included', () => {
  const schema = RESPONSE_SCHEMA as Schema;
  assertEquals('$schema' in schema, false);
  assertEquals(schema.required, ['isFood', 'items']);
  assertEquals(schema.properties.note.maxLength, 500);
  const item = schema.properties.items.items;
  assertEquals(schema.properties.items.maxItems, 12);
  assertEquals(item.required, ['name', 'searchName', 'grams', 'confidence', 'per100']);
  assertEquals(item.properties.name.maxLength, 100);
  assertEquals(item.properties.grams.minimum, 0);
  assertEquals(item.properties.note.maxLength, 200);
  // No longer than search_foods() searches.
  assertEquals(item.properties.searchName.maxLength, 50);
  assertEquals(item.properties.per100.properties.kcal.maximum, 900);
});

Deno.test('gives as examples only names the food library has, in each language', () => {
  const names = (language: Language) => new Set(Object.values(foods).map((food) => food[language]));
  for (const language of LANGUAGES) {
    const { examples, preparations } = SEARCH_NAMES[language];
    assertEquals(examples.length > 0, true, language);
    for (const example of examples) {
      assertEquals(names(language).has(example), true, `${language}: ${example}`);
      assertStringIncludes(SYSTEM, `"${example}"`);
    }
    assertStringIncludes(SYSTEM, preparations);
  }
});

Deno.test('asks for the search name in the reply language', () => {
  const searchName = SYSTEM.split('\n').find((line) => line.startsWith('- searchName:'))!;
  assertStringIncludes(searchName, 'always in the reply language, never in English');
});
