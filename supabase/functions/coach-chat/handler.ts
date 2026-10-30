// The request handling of coach-chat (#292, ADR 0052), apart from signing in, so that it can be
// tested with stand-ins for the database and the model. A user's message is answered as a stream
// of events, while Bite may look things up with its tools, and the turn is saved to its thread.
import { z } from 'zod';

import { aiModel, AiRefusedError, keepAlive } from '../_shared/ai_usage.ts';
import type { Json } from '../_shared/database.types.ts';
import { type LanguageModel, type Message, ModelError, type Part } from '../_shared/llm/mod.ts';
import { type Expression, readExpression, snapshotText, SYSTEM } from './prompt.ts';
import { type Client, loadSnapshot } from './snapshot.ts';
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
  message: z.string().trim().min(1).max(4000),
  /** The app's language, which Bite answers in. */
  language: z.enum(['en', 'de', 'tr']),
  /** The user's day, as their device has it. */
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** How many earlier messages Bite reads of a thread. */
const HISTORY = 20;

/** How many times Bite may look things up before it has to answer. */
const MAX_TOOL_ROUNDS = 4;

/** What the app is told as the answer comes, each a server-sent event. */
export type ChatEvent =
  | { event: 'expression'; expression: Expression }
  | { event: 'tool_start'; name: string }
  | { event: 'tool_end'; name: string }
  | { event: 'text'; text: string }
  | { event: 'done'; threadId: number; messageId: number }
  | { event: 'error'; reason: string };

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
      .select('role, content')
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

type Turn = {
  expression?: Expression;
  text: string;
  /** The tool calls and their results, in order, as the message keeps them. */
  trace: Part[];
  usage: { model?: string; input: number; cached: number; output: number; thinking: number };
};

async function answer(
  request: z.infer<typeof ChatRequest>,
  history: Message[],
  context: ChatContext,
  send: (event: ChatEvent) => void,
  isStopped: () => boolean,
): Promise<void> {
  const bite = aiModel(
    { supabase: context.supabase, admin: context.admin, model: context.model },
    'coach_chat',
  );
  const turn: Turn = {
    text: '',
    trace: [],
    usage: { input: 0, cached: 0, output: 0, thinking: 0 },
  };
  let start = '';
  const said = (text: string) => {
    if (turn.expression) {
      if (!text) return;
      turn.text += text;
      return send({ event: 'text', text });
    }
    // The answer starts with its expression, which the app shows before the text.
    start += text;
    const read = readExpression(start);
    if (!read) return;
    turn.expression = read.expression;
    send({ event: 'expression', expression: read.expression });
    if (read.rest) said(read.rest);
  };

  try {
    const snapshot = await loadSnapshot(context.supabase, request.today);
    const system = `${SYSTEM}\n\n${snapshotText(snapshot, request.language)}`;
    const messages: Message[] = [
      ...history,
      { role: 'user', parts: [{ type: 'text', text: request.message }] },
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
      for await (const event of bite.stream({ system, messages, tools })) {
        if (isStopped()) break;
        if (event.type === 'text') {
          said(event.text);
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
        }
      }
      if (!calls.length || isStopped()) break;

      const results: Part[] = [];
      for (const call of calls) {
        send({ event: 'tool_start', name: call.name });
        const result = await runTool(call.name, call.args, toolContext);
        send({ event: 'tool_end', name: call.name });
        results.push({ type: 'toolResult', id: call.id, name: call.name, result });
      }
      turn.trace.push(...calls, ...results);
      messages.push(
        { role: 'model', parts: [...spoken, ...calls] },
        { role: 'user', parts: results },
      );
    }
    // An answer too short to tell its expression by is said as it is.
    if (!turn.expression && start) {
      turn.expression = 'neutral';
      send({ event: 'expression', expression: 'neutral' });
      turn.text += start;
      send({ event: 'text', text: start });
    }
  } catch (error) {
    if (error instanceof AiRefusedError) return send({ event: 'error', reason: error.reason });
    if (!(error instanceof ModelError)) console.error('Bite could not answer', error);
    // What came is kept, as when the app stops the answer.
    if (!turn.text) return send({ event: 'error', reason: 'unavailable' });
    send({ event: 'error', reason: 'interrupted' });
  }

  if (!turn.text.trim()) return;
  const saved = await keepAlive(save(context, request, turn));
  if (saved) send({ event: 'done', ...saved });
  else send({ event: 'error', reason: 'not_saved' });
}

/** Saves the user's message and Bite's answer, in a new thread when there is none yet. */
async function save(
  context: ChatContext,
  request: z.infer<typeof ChatRequest>,
  turn: Turn,
): Promise<{ threadId: number; messageId: number } | undefined> {
  let threadId = request.threadId;
  if (!threadId) {
    const thread = await context.admin
      .from('coach_threads')
      .insert({ user_id: context.userId })
      .select('id')
      .single();
    if (thread.error) return void console.error('Could not start a thread', thread.error);
    threadId = thread.data.id;
  }
  const messages = await context.admin
    .from('coach_messages')
    .insert([
      { thread_id: threadId, role: 'user', content: [{ type: 'text', text: request.message }] },
      {
        thread_id: threadId,
        role: 'bite',
        content: [
          ...turn.trace,
          { type: 'text', text: turn.text.trim() },
        ] as unknown as NonNullable<Json>,
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
  if (messages.error) return void console.error('Could not save the messages', messages.error);
  return { threadId, messageId: messages.data[messages.data.length - 1].id };
}

/** An earlier message as Bite reads it: its text alone, without the lookups behind it. */
function toMessage(row: { role: 'user' | 'bite'; content: Json }): Message[] {
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
  return [{ role: row.role === 'bite' ? 'model' : 'user', parts: [{ type: 'text', text }] }];
}

function failed(message: string, error: unknown): Response {
  console.error(message, error);
  return Response.json({ error: 'unavailable' }, { status: 500 });
}
