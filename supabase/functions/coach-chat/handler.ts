// The request handling of coach-chat (#292, ADR 0052), apart from signing in, so that it can be
// tested with stand-ins for the database and the model. A user's message is answered as a stream
// of events, while Bite may look things up with its tools, and the turn is saved to its thread.
import { z } from 'zod';

import { aiModel, AiRefusedError, checkAiAccess, keepAlive } from '../_shared/ai_usage.ts';
import {
  type ChatEvent as Event,
  type ChatReason,
  type ChatRequest as Body,
  type Interruption,
  MAX_MESSAGE_LENGTH,
} from '../_shared/coach/chat.ts';
import type { Database, Json } from '../_shared/database.types.ts';
import {
  type Finish,
  type LanguageModel,
  type Message,
  ModelError,
  type Part,
} from '../_shared/llm/mod.ts';
import { type Client, logError } from '../_shared/supabase.ts';
import { type Expression, FaceReader, LANGUAGES, marker, snapshotText, SYSTEM } from './prompt.ts';
import { loadSnapshot } from './snapshot.ts';
import { DAY } from './day.ts';
import { runTool, TOOL_DEFINITIONS } from './tools.ts';

export type ChatContext = {
  /** A client with the user's token. */
  supabase: Client;
  /** A client with the service role, which alone writes threads and messages (ADR 0050). */
  admin: Client;
  userId: string;
  /** For tests; the language model by default. */
  model?: LanguageModel;
};

const ChatRequest = z.object({
  /** The thread to go on with; a new one without. */
  threadId: z.number().int().positive().optional(),
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  /** The app's language, which Bite answers in. */
  language: z.enum(LANGUAGES),
  /** The user's day, as their device has it. */
  today: DAY,
}) satisfies z.ZodType<Body>;
type ChatRequest = z.infer<typeof ChatRequest>;

/** How many earlier messages Bite reads of a thread. */
const HISTORY = 20;

/** How many times Bite may look things up before it has to answer. */
const MAX_TOOL_ROUNDS = 4;

/** How many lookups one round may make; more are answered with an error. */
const MAX_CALLS_PER_ROUND = 5;

/** What a saved message may hold (`coach_messages.content`), the answer's text part included. */
const MAX_PARTS = 50;
/**
 * Measured as JSON without spaces; Postgres prints jsonb with a space after each `,` and `:`,
 * which the check counts (65,536 bytes), so this leaves room for them.
 */
const MAX_CONTENT_BYTES = 50_000;

/** What the app is told as the answer comes, each a server-sent event (ADR 0052). */
export type ChatEvent = Event<Expression>;

export async function handleChatRequest(req: Request, context: ChatContext): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  const parsed = ChatRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_request', issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }
  const request = parsed.data;

  // The user reads only their own threads, so a thread they may not go on with is not found.
  let history: Message[] = [];
  if (request.threadId) {
    const thread = await context.supabase
      .from('coach_threads')
      .select('id')
      .eq('id', request.threadId)
      .maybeSingle();
    if (thread.error) return failed('Could not read the thread', thread.error);
    if (!thread.data) return Response.json({ error: 'thread_not_found' }, { status: 404 });
    const messages = await context.supabase
      .from('coach_messages')
      .select('role, content, expression')
      .eq('thread_id', request.threadId)
      .order('id', { ascending: false })
      .limit(HISTORY);
    if (messages.error) return failed('Could not read the thread', messages.error);
    history = messages.data.reverse().flatMap(toMessage);
  }

  let stopped = false;
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => {
      const encoder = new TextEncoder();
      const send = (event: ChatEvent) => {
        if (stopped) return;
        const { event: name, ...data } = event;
        controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      return answer(request, history, context, send, () => stopped).finally(() => {
        if (!stopped) controller.close();
      });
    },
    // The app stopped the answer: what came is kept, and the model is stopped.
    cancel: () => {
      stopped = true;
    },
  });
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
  });
}

/** Bite's answer as it comes, and what is saved of it. */
class Turn {
  expression?: Expression;
  text = '';
  /** The tool calls and their results, in order, as the message keeps them. */
  trace: Part[] = [];
  usage = { model: undefined as string | undefined, input: 0, cached: 0, output: 0, thinking: 0 };
  /** Why the last request's answer ended. */
  finish?: Finish;
  #face = new FaceReader();
  #roundStarted = false;

  constructor(private readonly send: (event: ChatEvent) => void) {}

  /** A new request's answer starts, with its own face to read off. */
  round() {
    this.#face = new FaceReader();
    this.#roundStarted = false;
  }

  said(text: string) {
    this.#show(this.#face.push(text));
  }

  /** The end of a request's answer: what was held back while it might have been a face. */
  ended() {
    this.#show(this.#face.end());
  }

  #show({ expression, text }: { expression?: Expression; text: string }) {
    // The answer's face is the first one; later requests' faces are only taken off.
    if (expression && !this.expression) {
      this.expression = expression;
      this.send({ event: 'expression', expression });
    }
    if (!text) return;
    // A request's answer after another's goes on after a space.
    if (!this.#roundStarted && this.text && !/\s$/.test(this.text) && !/^\s/.test(text)) {
      text = ` ${text}`;
    }
    this.#roundStarted = true;
    this.text += text;
    this.send({ event: 'text', text });
  }
}

async function answer(
  request: ChatRequest,
  history: Message[],
  context: ChatContext,
  send: (event: ChatEvent) => void,
  isStopped: () => boolean,
): Promise<void> {
  const bite = aiModel(
    { supabase: context.supabase, admin: context.admin, model: context.model },
    'coach_chat',
  );
  const turn = new Turn(send);
  const outcome: Outcome = { refused: false, asked: false };
  let threadId = request.threadId;

  // Nothing is written for a user who may not ask Bite now.
  try {
    await checkAiAccess(context.supabase);
  } catch (error) {
    if (error instanceof AiRefusedError) return send({ event: 'error', reason: error.reason });
    logError('Could not read the access to Bite', error);
    return send({ event: 'error', reason: 'unavailable' });
  }

  try {
    // A new thread is started at once, so that the app keeps it however the answer ends; it goes
    // again if the message is refused after all.
    if (!threadId) {
      const created = await context.admin
        .from('coach_threads')
        .insert({ user_id: context.userId })
        .select('id')
        .single();
      if (created.error) throw created.error;
      threadId = created.data.id;
      send({ event: 'thread', threadId });
    }
    const snapshot = await loadSnapshot(context.supabase, request.today);
    const messages: Message[] = [
      ...history,
      // The snapshot goes with the message, as data apart from the rules.
      {
        role: 'user',
        parts: [
          { type: 'text', text: snapshotText(snapshot, request.language) },
          { type: 'text', text: request.message },
        ],
      },
    ];
    const toolContext = {
      supabase: context.supabase,
      language: request.language,
      today: request.today,
    };

    for (let round = 0; round <= MAX_TOOL_ROUNDS && !isStopped(); round++) {
      // The last round is told to answer with what it has.
      const tools = round < MAX_TOOL_ROUNDS ? TOOL_DEFINITIONS : undefined;
      const spoken: Part[] = [];
      const calls: Extract<Part, { type: 'toolCall' }>[] = [];
      turn.round();
      for await (const event of bite.stream({ system: SYSTEM, messages, tools })) {
        outcome.asked = true;
        if (isStopped()) break;
        if (event.type === 'text') {
          turn.said(event.text);
          spoken.push(event);
        } else if (event.type === 'toolCall') {
          calls.push(event);
        } else {
          const { usage } = event;
          turn.usage.model = usage.model;
          turn.usage.input += usage.inputTokens;
          turn.usage.cached += usage.cachedInputTokens;
          turn.usage.output += usage.outputTokens;
          turn.usage.thinking += usage.thinkingTokens;
          turn.finish = event.finish;
        }
      }
      turn.ended();
      if (!calls.length || isStopped()) break;

      const results: Part[] = [];
      for (const [index, call] of calls.entries()) {
        const result =
          index < MAX_CALLS_PER_ROUND
            ? await lookUp(call, toolContext, send)
            : { error: `At most ${MAX_CALLS_PER_ROUND} lookups at once; ask for fewer.` };
        results.push({ type: 'toolResult', id: call.id, name: call.name, result });
      }
      turn.trace.push(...calls, ...results);
      messages.push(
        { role: 'model', parts: [...spoken, ...calls] },
        { role: 'user', parts: results },
      );
    }
  } catch (error) {
    if (error instanceof AiRefusedError) {
      outcome.failure = error.reason;
      outcome.refused = true;
    } else {
      logError('Bite could not answer', error);
      outcome.failure = 'unavailable';
      // A provider's error that was billed comes from a request that was made; one refused
      // outright, as a token count over the provider's rate, cost nothing and keeps nothing.
      if (error instanceof ModelError && error.billed) outcome.asked = true;
    }
  }

  if (!threadId) return send({ event: 'error', reason: outcome.failure ?? 'unavailable' });
  const end = ending(outcome, {
    said: turn.text.trim() !== '',
    stopped: isStopped(),
    finish: turn.finish,
    newThread: !request.threadId,
  });
  if (end.keep !== 'turn') {
    const dropped = end.dropThread && (await keepAlive(dropThread(context, threadId)));
    if (end.keep === 'question') await keepAlive(saveQuestion(context, threadId, request));
    return send({ event: 'error', reason: end.reason, ...(dropped && { dropped: true }) });
  }
  const messageId = await keepAlive(saveTurn(context, threadId, request, turn));
  if (!messageId) return send({ event: 'error', reason: 'not_saved' });
  send({
    event: 'done',
    threadId,
    messageId,
    ...(end.interrupted && { interrupted: end.interrupted }),
    ...(end.reason && { reason: end.reason }),
  });
}

/** How the requests of an answer went: why they failed, if refused, and if the model was asked. */
export type Outcome = { failure?: ChatReason; refused: boolean; asked: boolean };

/**
 * What is kept of a message, and what the app is told. An answer with text is kept as a turn,
 * saying why it stopped short if it did. Without text, a question the model was asked stays in
 * the thread unanswered, as the app shows it, so that Bite sees it next time; one that never
 * reached the model, or was refused, is not kept, and a thread begun for it goes again.
 */
export function ending(
  { failure, refused, asked }: Outcome,
  answer: { said: boolean; stopped: boolean; finish?: Finish; newThread: boolean },
):
  | { keep: 'turn'; interrupted?: Interruption; reason?: ChatReason }
  | { keep: 'question' | 'nothing'; reason: ChatReason; dropThread: boolean } {
  if (answer.said) {
    return { keep: 'turn', interrupted: interruption(), reason: failure };
  }
  const reason = failure ?? (answer.finish === 'blocked' ? 'blocked' : 'unavailable');
  // A question the model blocked is not kept either: sent again with every later message, it
  // would be blocked again, at a cost each time.
  const keep = asked && !refused && reason !== 'blocked' ? 'question' : 'nothing';
  return { keep, reason, dropThread: keep === 'nothing' && answer.newThread };

  function interruption(): Interruption | undefined {
    if (refused) return 'refused';
    if (failure) return 'failed';
    if (answer.stopped) return 'stopped';
    if (answer.finish !== 'stop') return 'cut';
  }
}

async function lookUp(
  call: Extract<Part, { type: 'toolCall' }>,
  context: Parameters<typeof runTool>[2],
  send: (event: ChatEvent) => void,
): Promise<unknown> {
  send({ event: 'tool_start', name: call.name });
  const result = await runTool(call.name, call.args, context);
  send({ event: 'tool_end', name: call.name });
  return result;
}

/** The user's message as the thread keeps it. */
function question(threadId: number, request: ChatRequest) {
  return {
    thread_id: threadId,
    role: 'user' as const,
    content: [{ type: 'text', text: request.message }],
  };
}

/** Saves a question Bite gave no answer to. */
async function saveQuestion(context: ChatContext, threadId: number, request: ChatRequest) {
  const saved = await context.admin.from('coach_messages').insert(question(threadId, request));
  if (saved.error) logError('Could not save the question', saved.error);
}

/** Saves the user's message and Bite's answer to the thread, and gives Bite's message's id. */
async function saveTurn(
  context: ChatContext,
  threadId: number,
  request: ChatRequest,
  turn: Turn,
): Promise<number | undefined> {
  const messages = await context.admin
    .from('coach_messages')
    .insert([
      question(threadId, request),
      {
        thread_id: threadId,
        role: 'bite',
        content: content(turn.trace, turn.text.trim()) as unknown as NonNullable<Json>,
        expression: turn.expression ?? 'neutral',
        model: turn.usage.model,
        input_tokens: turn.usage.input,
        cached_input_tokens: turn.usage.cached,
        output_tokens: turn.usage.output,
        thinking_tokens: turn.usage.thinking,
      },
    ])
    .select('id')
    .order('id');
  if (messages.error) return void logError('Could not save the messages', messages.error);
  return messages.data[messages.data.length - 1].id;
}

/**
 * Drops a thread begun for a message that is not kept, and says whether it did: another request
 * may have answered in it meanwhile, and then it stays.
 */
async function dropThread(context: ChatContext, threadId: number): Promise<boolean> {
  const kept = await context.admin
    .from('coach_messages')
    .select('id')
    .eq('thread_id', threadId)
    .limit(1);
  if (kept.error || kept.data.length) {
    if (kept.error) logError('Could not read the thread to drop', kept.error);
    return false;
  }
  const dropped = await context.admin.from('coach_threads').delete().eq('id', threadId);
  if (dropped.error) logError('Could not drop an empty thread', dropped.error);
  return !dropped.error;
}

/**
 * Bite's message as it is kept: its lookups and their results, then its text, within what a
 * message may hold. Too large, the results are left out first, then the lookups.
 */
export function content(trace: Part[], text: string): Part[] {
  const answer: Part = { type: 'text', text };
  const fits = (parts: Part[]) =>
    parts.length <= MAX_PARTS &&
    new TextEncoder().encode(JSON.stringify(parts)).length <= MAX_CONTENT_BYTES;
  const whole = [...trace.slice(0, MAX_PARTS - 1), answer];
  if (fits(whole)) return whole;
  const without = whole.map((part) =>
    part.type === 'toolResult' ? { ...part, result: { omitted: true } } : part,
  );
  return fits(without) ? without : [answer];
}

/** An earlier message as Bite reads it: its text alone, a face before Bite's, as it wrote it. */
function toMessage(
  row: Pick<
    Database['public']['Tables']['coach_messages']['Row'],
    'role' | 'content' | 'expression'
  >,
): Message[] {
  const parts = Array.isArray(row.content) ? row.content : [];
  const text = parts
    .flatMap((part) =>
      part &&
      typeof part === 'object' &&
      !Array.isArray(part) &&
      part.type === 'text' &&
      typeof part.text === 'string'
        ? [part.text]
        : [],
    )
    .join('\n');
  if (!text) return [];
  if (row.role === 'user') return [{ role: 'user', parts: [{ type: 'text', text }] }];
  const face = marker(row.expression ?? 'neutral');
  return [{ role: 'model', parts: [{ type: 'text', text: `${face} ${text}` }] }];
}

function failed(message: string, error: unknown): Response {
  logError(message, error);
  return Response.json({ error: 'unavailable' }, { status: 500 });
}
