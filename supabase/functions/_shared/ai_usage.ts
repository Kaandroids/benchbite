// The usage limit as the Edge Functions see it (#288, #322, ADR 0051): a model is called only
// through aiModel(), whose every request counts what it sends, starts a call that sets the most
// it may cost aside, and records what it used, however the request ends. The database knows the
// prices and the limit; a function only reports tokens.
import type { SupabaseContext } from '@supabase/server';

import type { Database } from './database.types.ts';
import {
  type Env,
  type LanguageModel,
  languageModel,
  ModelError,
  type ModelRequest,
  type ModelResponse,
  type StreamEvent,
  type Task,
  type Usage,
} from './llm/mod.ts';

export type AiAccessReason = Database['public']['Enums']['ai_access_reason'];
type AiCall = Database['public']['CompositeTypes']['ai_call'];

type Client = Pick<SupabaseContext<Database>['supabase'], 'rpc'>;

export type AiContext = {
  /** A client with the user's token, which starts each call as theirs. */
  supabase: Client;
  /** A client with the service role (`supabaseAdmin`), which alone may record usage. */
  admin: Client;
  /** The model to call; `languageModel(env)` by default, a `FakeModel` in tests. */
  model?: LanguageModel;
  /** Where `languageModel()` reads its settings; `Deno.env` by default. */
  env?: Env;
};

/** A request of the model's own task, which `aiModel()` fills in. */
export type AiRequest = Omit<ModelRequest, 'task'>;

/** The model for one task, whose every request is limited and counted. */
export type AiModel = {
  generate(request: AiRequest): Promise<ModelResponse>;
  stream(request: AiRequest): AsyncIterable<StreamEvent>;
};

/** A request the user may not make now, with the reason. */
export class AiRefusedError extends Error {
  constructor(readonly reason: AiAccessReason) {
    super(`AI call refused: ${reason}`);
    this.name = 'AiRefusedError';
  }
}

/** What a request used, or `unknown` when it ended before the provider said. */
type Used = Usage | 'nothing' | 'unknown';

/**
 * The model for `task`, for the user of `context`. Each request counts what it sends, starts a
 * call on the task's model that sets the most it may cost aside from the user's budget, cuts the
 * answer where the task's limit says, and records the call however it ends: at what it used, at
 * nothing when the provider refused it, or at its most when that is not known, as when a stream
 * is left or breaks off before its end. A request the user may not make throws
 * `AiRefusedError`.
 */
export function aiModel(context: AiContext, task: Task): AiModel {
  const inner = context.model ?? languageModel(context.env);

  async function start(request: AiRequest) {
    const full: ModelRequest = { ...request, task };
    const inputTokens = await inner.countTokens(full);
    const started = await context.supabase.rpc('start_ai_call', {
      feature: task,
      model: inner.model(task),
      input_tokens: inputTokens,
    });
    if (started.error) throw new Error(`start_ai_call: ${started.error.message}`);
    const call: AiCall = started.data;
    if (!call.allowed || !call.call_id || !call.max_output_tokens) {
      throw new AiRefusedError(call.reason ?? 'limit_reached');
    }
    const limit = call.max_output_tokens;
    const asked = request.maxOutputTokens;
    full.maxOutputTokens = Number.isInteger(asked) && asked! > 0 ? Math.min(asked!, limit) : limit;
    return { full, callId: call.call_id };
  }

  return {
    async generate(request) {
      const { full, callId } = await start(request);
      let used: Used = 'unknown';
      try {
        const response = await inner.generate(full);
        used = response.usage;
        return response;
      } catch (error) {
        if (error instanceof ModelError && !error.billed) used = 'nothing';
        throw error;
      } finally {
        await record(context.admin, callId, used);
      }
    },

    async *stream(request) {
      const { full, callId } = await start(request);
      let used: Used = 'unknown';
      try {
        for await (const event of inner.stream(full)) {
          if (event.type === 'done') used = event.usage;
          yield event;
        }
      } catch (error) {
        if (error instanceof ModelError && !error.billed) used = 'nothing';
        throw error;
      } finally {
        // Also when the stream is left before its end, which stops the request.
        await record(context.admin, callId, used);
      }
    },
  };
}

/** Records a call, trying once more if the first try fails, and logs it if both do. */
async function record(admin: Client, callId: string, used: Used) {
  const usage = typeof used === 'object' ? used : undefined;
  const args = {
    call_id: callId,
    input_tokens: usage?.inputTokens ?? 0,
    cached_input_tokens: usage?.cachedInputTokens ?? 0,
    output_tokens: usage?.outputTokens ?? 0,
    thinking_tokens: usage?.thinkingTokens ?? 0,
    known: used !== 'unknown',
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { error } = await admin.rpc('record_ai_usage', args);
    if (!error) return;
    // Logged, not thrown: the request's own result or error matters more to the caller. A call
    // never recorded is counted at its most once it is left behind.
    if (attempt === 2) console.error(`record_ai_usage: ${error.message}`);
  }
}
