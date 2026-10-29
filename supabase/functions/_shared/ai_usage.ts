// The usage limit as the Edge Functions see it (#288, ADR 0051): a call of a model runs only
// through withAiCall(), which starts it, and records what it used afterwards, also when it
// failed. The database knows the prices and the limit; a function only reports tokens.
import type { SupabaseContext } from '@supabase/server';

import type { Database } from './database.types.ts';
import { type Env, ModelError, modelFor, type Task, type Usage } from './llm/mod.ts';

export type AiAccess = Database['public']['CompositeTypes']['ai_access'];

type Client = Pick<SupabaseContext<Database>['supabase'], 'rpc'>;

export type AiCallContext = {
  /** A client with the user's token, which starts the call as theirs. */
  supabase: Client;
  /** A client with the service role (`supabaseAdmin`), which alone may record usage. */
  admin: Client;
  userId: string;
  /** Where the task's model is read from, as `languageModel()` reads it; `Deno.env` by default. */
  env?: Env;
};

/** What a call of a model gives back, and what it used. */
export type AiCallResult<T> = { result: T; usage: Usage };

/**
 * Runs `call` for `task` when the user may make it, and records what it used. The call is
 * started on the model `languageModel()` runs the task on, and priced by it. When `call` throws,
 * what a `ModelError` says it used is recorded, or nothing used, and the error is thrown on.
 * Returns the access, which says by `allowed` whether `call` ran and by `reason` why not, and the
 * call's result when it ran.
 */
export async function withAiCall<T>(
  { supabase, admin, userId, env = Deno.env }: AiCallContext,
  task: Task,
  call: () => Promise<AiCallResult<T>>,
): Promise<{ access: AiAccess; result?: T }> {
  const { model } = modelFor(task, env);
  const started = await supabase.rpc('start_ai_call', { feature: task, model });
  if (started.error) throw new Error(`start_ai_call: ${started.error.message}`);
  const access = started.data;
  if (!access.allowed || !access.call_id) return { access };

  let usage: Usage = {
    model,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
  };
  try {
    const done = await call();
    usage = done.usage;
    return { access, result: done.result };
  } catch (error) {
    if (error instanceof ModelError && error.usage) usage = error.usage;
    throw error;
  } finally {
    const recorded = await admin.rpc('record_ai_usage', {
      user_id: userId,
      feature: task,
      call_id: access.call_id,
      model: usage.model,
      input_tokens: usage.inputTokens,
      cached_input_tokens: usage.cachedInputTokens,
      output_tokens: usage.outputTokens,
      thinking_tokens: usage.thinkingTokens,
    });
    // Logged, not thrown: the call's own result or error matters more to the caller.
    if (recorded.error) console.error(`record_ai_usage: ${recorded.error.message}`);
  }
}
