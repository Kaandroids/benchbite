// The language model of the Edge Functions (ADR 0049): import from here, not from a provider.
import { type Env, modelFor } from './config.ts';
import { developerApi, GeminiModel } from './gemini.ts';
import type { LanguageModel, Task } from './types.ts';
import { serviceAccount, vertexAi } from './vertex.ts';

export * from './types.ts';
export { modelFor } from './config.ts';

/**
 * The model the environment sets up. `GEMINI_BACKEND=vertex` calls Vertex AI in the EU as the
 * service account of `VERTEX_SERVICE_ACCOUNT`, as the hosted project does (ADR 0153); `studio`
 * calls the Gemini Developer API with `GEMINI_API_KEY`, for test data only. There is no default,
 * so that no project calls the Developer API without saying so.
 */
export function languageModel(env: Env = Deno.env): LanguageModel {
  const backend = env.get('GEMINI_BACKEND');
  if (!backend) throw new Error('GEMINI_BACKEND is not set');
  const models = (task: Task) => modelFor(task, env);
  if (backend === 'vertex') {
    const account = env.get('VERTEX_SERVICE_ACCOUNT');
    if (!account) throw new Error('VERTEX_SERVICE_ACCOUNT is not set');
    return new GeminiModel({ endpoint: vertexAi(serviceAccount(account)), models });
  }
  if (backend !== 'studio') throw new Error(`Unknown GEMINI_BACKEND: ${backend}`);
  const apiKey = env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  return new GeminiModel({ endpoint: developerApi(apiKey), models });
}
