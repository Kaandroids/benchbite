import { assertEquals, assertInstanceOf, assertThrows } from '@std/assert';
import { GeminiModel } from './gemini.ts';
import { MODELS } from './config.ts';
import { languageModel, modelFor } from './mod.ts';

const env = (values: Record<string, string>) => ({ get: (name: string) => values[name] });

Deno.test('sets up Gemini through its API key', () => {
  assertInstanceOf(
    languageModel(env({ GEMINI_BACKEND: 'studio', GEMINI_API_KEY: 'key' })),
    GeminiModel,
  );
});

Deno.test('refuses a missing backend or key, and an unknown backend', () => {
  assertThrows(
    () => languageModel(env({ GEMINI_API_KEY: 'key' })),
    Error,
    'GEMINI_BACKEND is not set',
  );
  assertThrows(
    () => languageModel(env({ GEMINI_BACKEND: 'studio' })),
    Error,
    'GEMINI_API_KEY is not set',
  );
  assertThrows(
    () => languageModel(env({ GEMINI_BACKEND: 'other', GEMINI_API_KEY: 'key' })),
    Error,
    'Unknown GEMINI_BACKEND',
  );
});

Deno.test('sets up Gemini on Vertex AI as a service account', () => {
  const account = btoa(
    JSON.stringify({ project_id: 'project', client_email: 'bite@project', private_key: 'key' }),
  );
  assertInstanceOf(
    languageModel(env({ GEMINI_BACKEND: 'vertex', VERTEX_SERVICE_ACCOUNT: account })),
    GeminiModel,
  );
});

Deno.test('refuses Vertex AI without a service account, or with what is not one', () => {
  assertThrows(
    // The Developer API's key does not stand in for it.
    () => languageModel(env({ GEMINI_BACKEND: 'vertex', GEMINI_API_KEY: 'key' })),
    Error,
    'VERTEX_SERVICE_ACCOUNT is not set',
  );
  assertThrows(
    () => languageModel(env({ GEMINI_BACKEND: 'vertex', VERTEX_SERVICE_ACCOUNT: '{not base64}' })),
    Error,
    'not the base64 of a key file',
  );
  assertThrows(
    () =>
      languageModel(
        env({ GEMINI_BACKEND: 'vertex', VERTEX_SERVICE_ACCOUNT: btoa('{"project_id":"p"}') }),
      ),
    Error,
    'not a service account key',
  );
});

Deno.test("takes a task's model from the environment where it names one", () => {
  assertEquals(modelFor('coach_chat', env({})), MODELS.coach_chat);
  assertEquals(modelFor('coach_chat', env({ LLM_MODEL_COACH_CHAT: ' gemini-other ' })), {
    model: 'gemini-other',
    thinking: 'low',
  });
  assertEquals(modelFor('review', env({ LLM_MODEL_COACH_CHAT: 'gemini-other' })), MODELS.review);
  assertEquals(
    modelFor('meal_photo', env({ LLM_MODEL_MEAL_PHOTO: 'gemini-other' })).model,
    'gemini-other',
  );
});
