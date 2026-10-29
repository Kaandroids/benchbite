// The usage limit as the Edge Functions see it (#288, ADR 0051): a call of a model runs only
// through withAiCall(), which starts it, and records what it used afterwards, also when it
// failed. The database knows the prices and the limit; a function only reports tokens.
import type { SupabaseContext } from '@supabase/server';

import type { Database } from './database.types.ts';
import { ModelError, type Task, type Usage } from './llm/mod.ts';

export type AiAccess = Database['public']['CompositeTypes']['ai_access'];

type Client = Pick<SupabaseContext<Database>['supabase'], 'rpc'>;

export type AiCallContext = {
  /** A client with the user's token, which starts the call as theirs. */
  supabase: Client;
  /** A client with the service role (`supabaseAdmin`), which alone may record usage. */
  admin: Client;
  userId: string;
};

/**
 * Runs `call`, a call of `model` for `task`, when the user may make it, and records what it used.
 * `call` returns its usage; when it throws, what a `ModelError` says it used is recorded, or
 * nothing used, and the error is thrown on. Returns the access, which says by `allowed` whether
 * `call` ran, and by `reason` why not.
 */
export async function withAiCall(
  { supabase, admin, userId }: AiCallContext,
  task: Task,
  model: string,
  call: () => Promise<Usage>,
): Promise<AiAccess> {
  const started = await supabase.rpc('start_ai_call', { feature: task, model });
  if (started.error) throw new Error(`start_ai_call: ${started.error.message}`);
  const access = started.data;
  if (!access.allowed || !access.call_id) return access;

  let usage: Usage = {
    model,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
  };
  try {
    usage = await call();
    return access;
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
    // Not seen when `call` threw, whose error matters more; logged, as the call went uncounted.
    if (recorded.error) console.error(`record_ai_usage: ${recorded.error.message}`);
  }
}
