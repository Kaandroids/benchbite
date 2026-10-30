import { assertEquals } from '@std/assert';

import { RESPONSE_SCHEMA } from './prompt.ts';

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
