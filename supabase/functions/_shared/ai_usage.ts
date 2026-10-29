// The usage limit as the Edge Functions see it (#288, #322, ADR 0051): a model is called only
// through withAiCall(), which starts the call, setting the most it may cost aside, hands out the
// model for its task, and records what it used, however the call ends. The database knows the
// prices and the limit; a function only reports tokens.
import type { SupabaseContext } from '@supabase/server';

import type { Database } from './database.types.ts';
import {
  type Env,
  type LanguageModel,
  languageModel,
  type ModelRequest,
  type ModelResponse,
  modelFor,
  type StreamEvent,
  type Task,
  type Usage,
} from './llm/mod.ts';

export type AiAccess = Database['public']['CompositeTypes']['ai_access'];

type Client = Pick<SupabaseContext<Database>['supabase'], 'rpc'>;

export type AiCallContext = {
  /** A client with the user's token, which starts the call as theirs. */
  supabase: Client;
  /** A client with the service role (`supabaseAdmin`), which alone may record usage. */
  admin: Client;
  /** Where the task's model is read from; `Deno.env` by default. */
  env?: Env;
  /** The model to call; `languageModel(env)` by default, a `FakeModel` in tests. */
  model?: LanguageModel;
};

/** A request of the call's own task, which `withAiCall()` fills in. */
export type AiRequest = Omit<ModelRequest, 'task' | 'onUsage'>;

/** The model of one call, for its task only, cut where the call's limit says. */
export type AiModel = {
  generate(request: AiRequest): Promise<ModelResponse>;
  stream(request: AiRequest): AsyncIterable<StreamEvent>;
};

/**
 * Runs `call` for `task` when the user may make it, with the model for the task, and records
 * what the model used, however `call` ends: also when it throws or stops reading a stream
 * part-way. When the model was called but never said what it used, the call is counted at the
 * most it could have cost. Returns the access, which says by `allowed` whether `call` ran and by
 * `reason` why not, and the call's result when it ran.
 */
export async function withAiCall<T>(
  context: AiCallContext,
  task: Task,
  call: (model: AiModel) => Promise<T>,
): Promise<{ access: AiAccess; result?: T }> {
  const { supabase, admin, env = Deno.env } = context;
  const started = await supabase.rpc('start_ai_call', {
    feature: task,
    model: modelFor(task, env).model,
  });
  if (started.error) throw new Error(`start_ai_call: ${started.error.message}`);
  const access = started.data;
  if (!access.allowed || !access.call_id || !access.max_output_tokens) return { access };

  const inner = context.model ?? languageModel(env);
  const limit = access.max_output_tokens;
  let called = false;
  let usage: Usage | undefined;
  const of = (request: AiRequest): ModelRequest => {
    called = true;
    return {
      ...request,
      task,
      maxOutputTokens: Math.min(request.maxOutputTokens ?? limit, limit),
      onUsage: (used) => (usage = used),
    };
  };
  const model: AiModel = {
    generate: (request) => inner.generate(of(request)),
    stream: (request) => inner.stream(of(request)),
  };

  try {
    return { access, result: await call(model) };
  } finally {
    await record(admin, access.call_id, called, usage);
  }
}

/** Records a call, trying once more if the first try fails, and logs it if both do. */
async function record(admin: Client, callId: string, called: boolean, usage?: Usage) {
  const args = {
    call_id: callId,
    input_tokens: usage?.inputTokens ?? 0,
    cached_input_tokens: usage?.cachedInputTokens ?? 0,
    output_tokens: usage?.outputTokens ?? 0,
    thinking_tokens: usage?.thinkingTokens ?? 0,
    // A model called that never said what it used is counted at the most it could have cost.
    known: !called || usage !== undefined,
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { error } = await admin.rpc('record_ai_usage', args);
    if (!error) return;
    // Logged, not thrown: the call's own result or error matters more to the caller. A call
    // never recorded is counted at its most once its place is taken over.
    if (attempt === 2) console.error(`record_ai_usage: ${error.message}`);
  }
}
