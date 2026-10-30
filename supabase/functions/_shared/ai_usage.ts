// The usage limit as the Edge Functions see it (#288, #322, ADR 0051, ADR 0056): a model is called
// only through aiModel(), whose every request starts a call, counts what it sends, sets the most
// it may cost aside, and records what it used, however the request ends. The database knows the
// prices and the limit; a function only reports tokens.
import type { Database } from './database.types.ts';
import type { Client as SupabaseClient } from './supabase.ts';
import {
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

type Client = Pick<SupabaseClient, 'rpc'>;

export type AiContext = {
  /** A client with the user's token, which starts each call as theirs. */
  supabase: Client;
  /** A client with the service role (`supabaseAdmin`), which alone may record usage. */
  admin: Client;
  /** The model to call; `languageModel()` by default, a `FakeModel` in tests. */
  model?: LanguageModel;
};

/** A request of the model's own task, which `aiModel()` fills in. */
export type AiRequest = Omit<ModelRequest, 'task'>;

/** The model for one task, whose every request is limited and counted. */
export type AiModel = {
  generate(request: AiRequest): Promise<ModelResponse>;
  stream(request: AiRequest): AsyncIterable<StreamEvent>;
};

/**
 * A request the user may not make now, with the reason. It can come although `ai_access()` said
 * the user may call a model: as `limit_reached` when too little budget is left for this request
 * at its most, or `request_too_large`, so the app takes the reason from the request.
 */
export class AiRefusedError extends Error {
  constructor(readonly reason: AiAccessReason) {
    super(`AI call refused: ${reason}`);
    this.name = 'AiRefusedError';
  }
}

/**
 * Makes sure the user of `supabase`, a client with their token, may call a model now: throws
 * `AiRefusedError` with the reason when not, and an error when that cannot be read.
 */
export async function checkAiAccess(supabase: Client): Promise<void> {
  const access = await supabase.rpc('ai_access');
  if (access.error) throw new Error(`ai_access: ${access.error.message}`);
  if (!access.data.allowed) throw new AiRefusedError(access.data.reason ?? 'limit_reached');
}

/**
 * How long a count with the provider may take while the user's place is held; one that takes
 * longer gives the place up at nothing, rather than holding it until the call is left behind.
 */
const COUNT_TIMEOUT_MS = 10_000;

/** `promise`, or an error once `ms` have passed without it. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** How long to wait after each failed try to record a call, before the next; the last has none. */
const RECORD_RETRIES_MS = [250, 1000, undefined];

/** What a request used, or `unknown` when it ended before the provider said. */
type Used = Usage | 'nothing' | 'unknown';

/**
 * The model for `task`, for the user of `context`. Each request starts a call on the task's model,
 * counts what it sends, sets the most the call may cost aside from the user's budget, cuts the
 * answer where the task's limit says, and records the call however it ends: at what it used, at
 * nothing when the provider refused it, or at its most when that is not known, as when a stream
 * is left or breaks off before its end. A request the user may not make throws
 * `AiRefusedError`.
 */
export function aiModel(context: AiContext, task: Task): AiModel {
  const inner = context.model ?? languageModel();

  async function start(request: AiRequest) {
    // Who may not call a model at all is told so before anything is sent to the provider.
    await checkAiAccess(context.supabase);

    // A copy of its own, so that what is counted is what is sent, whatever the caller changes.
    const full: ModelRequest = { ...structuredClone(request), task };
    // The user's one place for the feature is taken before anything goes to the provider, so that
    // parallel requests stop at call_in_progress rather than each counting with it (ADR 0056).
    const started = await context.supabase.rpc('start_ai_call', {
      feature: task,
      model: inner.model(task),
      input_tokens: 0,
    });
    if (started.error) throw new Error(`start_ai_call: ${started.error.message}`);
    const placed: AiCall = started.data;
    if (!placed.allowed || !placed.call_id) {
      throw new AiRefusedError(placed.reason ?? 'limit_reached');
    }
    const callId = placed.call_id;
    let call: AiCall;
    try {
      const inputTokens = await withTimeout(inner.countTokens(full), COUNT_TIMEOUT_MS);
      const counted = await context.supabase.rpc('count_ai_call', {
        call_id: callId,
        input_tokens: inputTokens,
      });
      if (counted.error) throw new Error(`count_ai_call: ${counted.error.message}`);
      call = counted.data;
    } catch (error) {
      // Nothing went to the model: the place is given up at no cost.
      await keepAlive(record(context.admin, callId, 'nothing'));
      throw error;
    }
    // A count refused gives the place up itself.
    if (!call.allowed || !call.max_output_tokens) {
      throw new AiRefusedError(call.reason ?? 'limit_reached');
    }
    const limit = call.max_output_tokens;
    const asked = request.maxOutputTokens;
    full.maxOutputTokens = Number.isInteger(asked) && asked! > 0 ? Math.min(asked!, limit) : limit;
    return { full, callId };
  }

  return {
    async generate(request) {
      const { full, callId } = await start(request);
      let used: Used = 'unknown';
      try {
        const response = await inner.generate(full);
        used = told(response.usage);
        return response;
      } catch (error) {
        used = usedBy(error);
        throw error;
      } finally {
        await keepAlive(record(context.admin, callId, used));
      }
    },

    async *stream(request) {
      const { full, callId } = await start(request);
      let used: Used = 'unknown';
      try {
        for await (const event of inner.stream(full)) {
          if (event.type === 'done') used = told(event.usage);
          yield event;
        }
      } catch (error) {
        used = usedBy(error);
        throw error;
      } finally {
        // Also when the stream is left before its end, which stops the request.
        await keepAlive(record(context.admin, callId, used));
      }
    },
  };
}

/**
 * What an answer used, as the provider told it. A request always sends something, so an answer
 * that says it used no input said nothing, and is counted at its most.
 */
function told(usage: Usage): Used {
  return usage.inputTokens > 0 ? usage : 'unknown';
}

/** What a request that failed used: nothing when the provider refused it, else not known. */
function usedBy(error: unknown): Used {
  return error instanceof ModelError && !error.billed ? 'nothing' : 'unknown';
}

/**
 * Keeps the Edge Function's worker alive until `work` is done, also after its response ended, as
 * when the app closed a stream.
 */
export function keepAlive<T>(work: Promise<T>): Promise<T> {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(work: Promise<unknown>): void } })
    .EdgeRuntime;
  runtime?.waitUntil(work);
  return work;
}

/** Records a call, trying again a little later twice if it fails, and logs it if every try does. */
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
  for (const wait of RECORD_RETRIES_MS) {
    const { error } = await admin.rpc('record_ai_usage', args);
    if (!error) return;
    if (wait === undefined) {
      // Logged, not thrown: the request's own result or error matters more to the caller. A call
      // never recorded is counted at its most once it is left behind.
      console.error(`record_ai_usage: ${error.message}`);
    } else {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}
