// The usage limit as the Edge Functions see it (#288, ADR 0051): start a call before the model,
// and record what it used after it, also when it failed. The database knows the prices and the
// limit; a function only reports tokens.
import type { SupabaseContext } from '@supabase/server';

import type { Database } from './database.types.ts';
import type { Task, Usage } from './llm/mod.ts';

export type AiAccess = Database['public']['CompositeTypes']['ai_access'];

type Client = Pick<SupabaseContext<Database>['supabase'], 'rpc'>;

/**
 * Starts a call of `model` for `task`, with `supabase`, a client with the user's token. The call
 * may go ahead only when the result is `allowed`; otherwise its `reason` says why not.
 */
export async function startAiCall(supabase: Client, task: Task, model: string): Promise<AiAccess> {
  const { data, error } = await supabase.rpc('start_ai_call', { feature: task, model });
  if (error) throw new Error(`start_ai_call: ${error.message}`);
  return data;
}

/**
 * Records a call that `startAiCall()` started, and ends it, with `admin`, a client with the
 * service role (`supabaseAdmin`), as only Edge Functions may. Returns what it cost.
 */
export async function recordAiUsage(
  admin: Client,
  userId: string,
  task: Task,
  usage: Usage,
): Promise<number> {
  const { data, error } = await admin.rpc('record_ai_usage', {
    user_id: userId,
    feature: task,
    model: usage.model,
    input_tokens: usage.inputTokens,
    cached_input_tokens: usage.cachedInputTokens,
    output_tokens: usage.outputTokens,
    thinking_tokens: usage.thinkingTokens,
  });
  if (error) throw new Error(`record_ai_usage: ${error.message}`);
  return data;
}
