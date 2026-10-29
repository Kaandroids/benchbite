import { assertEquals, assertInstanceOf, assertThrows } from '@std/assert';
import { GeminiModel } from './gemini.ts';
import { languageModel, MODELS, modelFor } from './mod.ts';

const env = (values: Record<string, string>) => ({ get: (name: string) => values[name] });

Deno.test('sets up Gemini through its API key by default', () => {
  assertInstanceOf(languageModel(env({ GEMINI_API_KEY: 'key' })), GeminiModel);
});

Deno.test('refuses a missing key, Vertex for now, and an unknown backend', () => {
  assertThrows(() => languageModel(env({})), Error, 'GEMINI_API_KEY is not set');
  assertThrows(
    () => languageModel(env({ GEMINI_BACKEND: 'vertex', GEMINI_API_KEY: 'key' })),
    Error,
    'not supported yet',
  );
  assertThrows(
    () => languageModel(env({ GEMINI_BACKEND: 'other', GEMINI_API_KEY: 'key' })),
    Error,
    'Unknown GEMINI_BACKEND',
  );
});

Deno.test("takes a task's model from the environment where it names one", () => {
  assertEquals(modelFor('chat', env({})), MODELS.chat);
  assertEquals(modelFor('chat', env({ LLM_MODEL_CHAT: ' gemini-other ' })), {
    model: 'gemini-other',
    thinking: 'low',
  });
  assertEquals(modelFor('review', env({ LLM_MODEL_CHAT: 'gemini-other' })), MODELS.review);
});
