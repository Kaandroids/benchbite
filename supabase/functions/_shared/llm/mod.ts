// The language model of the Edge Functions (ADR 0049): import from here, not from a provider.
import { modelFor } from './config.ts';
import { GeminiModel } from './gemini.ts';
import type { LanguageModel } from './types.ts';

export * from './types.ts';
export { MODELS, modelFor } from './config.ts';

type Env = { get(name: string): string | undefined };

/**
 * The model the environment sets up. `GEMINI_BACKEND=studio` (the default) calls the Gemini
 * Developer API with `GEMINI_API_KEY`; `vertex`, Vertex AI in the EU, comes before the release.
 */
export function languageModel(env: Env = Deno.env): LanguageModel {
  const backend = env.get('GEMINI_BACKEND') ?? 'studio';
  if (backend === 'vertex') throw new Error('GEMINI_BACKEND=vertex is not supported yet');
  if (backend !== 'studio') throw new Error(`Unknown GEMINI_BACKEND: ${backend}`);
  const apiKey = env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  return new GeminiModel({ apiKey, models: (task) => modelFor(task, env) });
}
