// The usage limit as the Edge Functions see it (#288, ADR 0051): ask before calling a model, and
// record what the call used after it. The database knows the prices and the limit; a function
// only reports tokens.
import type { SupabaseContext } from '@supabase/server';

import type { Database } from './database.types.ts';
import type { Usage } from './llm/mod.ts';

export type AiFeature = Database['public']['Enums']['ai_feature'];
export type AiAccess = Database['public']['CompositeTypes']['ai_access'];

type Client = Pick<SupabaseContext<Database>['supabase'], 'rpc'>;

/** Whether the user of `supabase`, a client with the user's token, may call a model now. */
export async function aiAccess(supabase: Client): Promise<AiAccess> {
  const { data, error } = await supabase.rpc('ai_access');
  if (error) throw new Error(`ai_access: ${error.message}`);
  return data;
}

/**
 * Records a call of a model for a user, with `admin`, a client with the service role
 * (`supabaseAdmin`), as only Edge Functions may. Returns what it cost.
 */
export async function recordAiUsage(
  admin: Client,
  userId: string,
  feature: AiFeature,
  usage: Usage,
): Promise<number> {
  const { data, error } = await admin.rpc('record_ai_usage', {
    user_id: userId,
    feature,
    model: usage.model,
    input_tokens: usage.inputTokens,
    cached_input_tokens: usage.cachedInputTokens,
    output_tokens: usage.outputTokens,
    thinking_tokens: usage.thinkingTokens,
  });
  if (error) throw new Error(`record_ai_usage: ${error.message}`);
  return data;
}
