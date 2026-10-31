// The request handling of coach-chat (#292, ADR 0052), apart from signing in, so that it can be
// tested with stand-ins for the database and the model. A user's message is answered as a stream
// of events, while Bite may look things up with its tools, and the turn is saved to its thread.
import { z } from 'zod';

import { aiModel, AiRefusedError, checkAiAccess, keepAlive } from '../_shared/ai_usage.ts';
import { Base64Data } from '../_shared/base64.ts';
import {
  type ChatEvent as Event,
  type ChatPhotoPart,
  type ChatReason,
  type ChatRefusal,
  type ChatRequest as Body,
  type Interruption,
  MAX_MESSAGE_LENGTH,
  type ProposalCard,
} from '../_shared/coach/chat.ts';
import type { Database, Json } from '../_shared/database.types.ts';
import { isObject } from '../_shared/json.ts';
import {
  type Finish,
  type LanguageModel,
  type Message,
  ModelError,
  type Part,
} from '../_shared/llm/mod.ts';
import { decodedBytes, MAX_PHOTOS, photosBodyBytes, photosFit } from '../_shared/photos.ts';
import { LANGUAGES, untagged } from '../_shared/prompt.ts';
import { readJson, TOO_LARGE } from '../_shared/request.ts';
import { type Client, logError } from '../_shared/supabase.ts';
import {
  type Expression,
  FaceReader,
  marker,
  messageText,
  snapshotText,
  SYSTEM,
  untaggedAll,
} from './prompt.ts';
import { type CheckedPhoto, decodeBase64, readJpeg, removePhotos, storePhotos } from './photos.ts';
import { loadSnapshot } from './snapshot.ts';
import { DAY, TIME } from './day.ts';
import { runTool, TOOL_DEFINITIONS } from './tools.ts';

export type ChatContext = {
  /** A client with the user's token. */
  supabase: Client;
  /** A client with the service role, which alone writes threads and messages (ADR 0050). */
  admin: Client;
  userId: string;
  /** For tests; the language model by default. */
  model?: LanguageModel;
  /** For tests; how often a stop is looked for while the answer comes, STOP_CHECK_MS by default. */
  stopCheckMs?: number;
};

const Photo = z.object({
  mimeType: z.literal('image/jpeg'),
  data: Base64Data,
});

const ChatRequest = z
  .object({
    /** The thread to go on with; a new one without. */
    threadId: z.number().int().positive().optional(),
    /** What the user wrote, which may be nothing with photos. */
    message: z.string().trim().max(MAX_MESSAGE_LENGTH).default(''),
    photos: z.array(Photo).max(MAX_PHOTOS).default([]),
    /** The device's local time, HH:MM. */
    localTime: TIME.optional(),
    /** The app's language, which Bite answers in. */
    language: z.enum(LANGUAGES),
    /** The user's day, as their device has it. */
    today: DAY,
    /** The name the app stops this request by. */
    requestId: z.uuid().optional(),
  })
  .refine((request) => request.message || request.photos.length, {
    path: ['message'],
    message: 'A message needs text or a photo',
  }) satisfies z.ZodType<Body>;
type ChatRequest = z.infer<typeof ChatRequest>;

/**
 * The largest body read, in bytes: the photos at their largest as base64, and room for the rest,
 * the longest message included. A larger one is refused before it is parsed.
 */
const MAX_BODY_BYTES = photosBodyBytes(40_000);

/** The HTTP status each refusal is answered with. */
const STATUS: Record<ChatRefusal, number> = {
  invalid_request: 400,
  thread_not_found: 404,
  photos_too_large: 413,
  photo_not_jpeg: 415,
  photo_has_exif: 422,
  unavailable: 500,
};

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
  const json = await readJson(req, MAX_BODY_BYTES);
  if (json === TOO_LARGE) return refused('photos_too_large');

  const parsed = ChatRequest.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_request', issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }
  const request = parsed.data;
  // Photos are checked before anything is sent or kept (ADR 0062).
  if (!photosFit(request.photos.map((photo) => decodedBytes(photo.data)))) {
    return refused('photos_too_large');
  }
  const photos: CheckedPhoto[] = [];
  for (const [index, { data }] of request.photos.entries()) {
    const bytes = decodeBase64(data);
    const read = readJpeg(bytes);
    if (typeof read === 'string') return refused(read, { photo: index });
    photos.push({ bytes, data, ...read });
  }

  // The user reads only their own threads, so a thread they may not go on with is not found.
  let history: Message[] = [];
  if (request.threadId) {
    const thread = await context.supabase
      .from('coach_threads')
      .select('id')
      .eq('id', request.threadId)
      .maybeSingle();
    if (thread.error) return failed('Could not read the thread', thread.error);
    if (!thread.data) return refused('thread_not_found');
    const messages = await context.supabase
      .from('coach_messages')
      .select('role, content, expression')
      .eq('thread_id', request.threadId)
      .order('id', { ascending: false })
      .limit(HISTORY);
    if (messages.error) return failed('Could not read the thread', messages.error);
    history = messages.data.reverse().flatMap(toMessage);
  }

  const stop = new Stop(context, request.requestId);
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => {
      const encoder = new TextEncoder();
      const send = (event: ChatEvent) => {
        if (stop.cancelled) return;
        const { event: name, ...data } = event;
        controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      return answer(request, photos, history, context, send, stop).finally(() => {
        if (!stop.cancelled) controller.close();
        return keepAlive(stop.forget());
      });
    },
    // The app stopped the answer: what came is kept, and the model is stopped.
    cancel: () => stop.cancel(),
  });
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
  });
}

/** How often the function looks whether the app stopped the answer, while it comes. */
const STOP_CHECK_MS = 1000;

/**
 * Whether the app stopped the answer (#327, ADR 0057): its request was closed, which does not
 * always reach the function, or it said so with stop_coach_request(), which the function reads
 * when asked to `look`, at most once a second unless `now`.
 */
class Stop {
  #cancelled = false;
  #asked = false;
  #lookedAt = 0;

  constructor(
    private readonly context: ChatContext,
    private readonly requestId: string | undefined,
  ) {}

  /** The app closed the request, so nothing more can be sent to it. */
  get cancelled() {
    return this.#cancelled;
  }

  /** Whether the answer was stopped, as far as is known now. */
  get stopped() {
    return this.#cancelled || this.#asked;
  }

  cancel() {
    this.#cancelled = true;
  }

  async look({ now = false } = {}): Promise<boolean> {
    if (this.stopped || !this.requestId) return this.stopped;
    const every = this.context.stopCheckMs ?? STOP_CHECK_MS;
    if (!now && Date.now() - this.#lookedAt < every) return false;
    this.#lookedAt = Date.now();
    const { data, error } = await this.context.admin
      .from('coach_stops')
      .select('request_id')
      .eq('request_id', this.requestId)
      .eq('user_id', this.context.userId)
      .maybeSingle();
    if (error) logError('Could not look for a stop', error);
    this.#asked = !!data;
    return this.#asked;
  }

  /** Removes the stop of this request, if the app sent one. */
  async forget() {
    if (!this.requestId) return;
    const { error } = await this.context.admin
      .from('coach_stops')
      .delete()
      .eq('request_id', this.requestId)
      .eq('user_id', this.context.userId);
    if (error) logError('Could not remove a stop', error);
  }
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
  photos: CheckedPhoto[],
  history: Message[],
  context: ChatContext,
  send: (event: ChatEvent) => void,
  stop: Stop,
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
    // A message stopped before anything began leaves nothing behind.
    if (await stop.look({ now: true })) return;
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
    const snapshot = await loadSnapshot(context.supabase, request.today, request.localTime);
    const messages: Message[] = [
      ...history,
      // The snapshot goes with the message, as data apart from the rules, and the photos before
      // the message, in this turn only: later turns read them as text (toMessage()).
      {
        role: 'user',
        parts: [
          { type: 'text', text: snapshotText(snapshot, request.language) },
          ...photos.map(({ data }): Part => ({ type: 'image', mimeType: 'image/jpeg', data })),
          { type: 'text', text: messageText(request.message) },
        ],
      },
    ];
    const toolContext = {
      supabase: context.supabase,
      language: request.language,
      today: request.today,
      threadId,
    };

    for (let round = 0; round <= MAX_TOOL_ROUNDS && !(await stop.look({ now: true })); round++) {
      // The last round is told to answer with what it has.
      const tools = round < MAX_TOOL_ROUNDS ? TOOL_DEFINITIONS : undefined;
      const spoken: Part[] = [];
      const calls: Extract<Part, { type: 'toolCall' }>[] = [];
      turn.round();
      for await (const event of bite.stream({ system: SYSTEM, messages, tools })) {
        outcome.asked = true;
        // The end of a round is kept whatever comes, so that what the answer used is too.
        if (event.type !== 'done' && (await stop.look())) break;
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
      if (!calls.length || stop.stopped) break;

      const results: Part[] = [];
      for (const [index, call] of calls.entries()) {
        if (await stop.look({ now: true })) break;
        const result =
          index < MAX_CALLS_PER_ROUND
            ? await lookUp(call, toolContext, send)
            : { error: `At most ${MAX_CALLS_PER_ROUND} lookups at once; ask for fewer.` };
        results.push({ type: 'toolResult', id: call.id, name: call.name, result });
      }
      if (stop.stopped) {
        // Stopped among its lookups, the round keeps those that ended, each call with its result,
        // as a proposal made among them is saved, and its card with it.
        turn.trace.push(...calls.slice(0, results.length), ...results);
        break;
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
    // A proposal made is kept with its card, even if the model ended without a word.
    said: turn.text.trim() !== '' || turn.trace.some(isProposal),
    stopped: stop.stopped,
    finish: turn.finish,
    newThread: !request.threadId,
  });
  if (end.keep !== 'turn') {
    const dropped = end.dropThread && (await keepAlive(dropThread(context, threadId)));
    if (end.keep === 'question') {
      await keepAlive(saveQuestion(context, threadId, request, photos));
    }
    return send({ event: 'error', reason: end.reason, ...(dropped && { dropped: true }) });
  }
  const messageId = await keepAlive(
    saveTurn(context, threadId, request, photos, turn, end.interrupted),
  );
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
  // What the user named things comes back with it, and may not pass for a snapshot either.
  const result = untaggedAll(await runTool(call.name, call.args, context));
  send({ event: 'tool_end', name: call.name });
  // A proposed change is shown as a card under the answer; the message keeps it with the result.
  const proposal = proposalOf(result);
  if (proposal) send({ event: 'proposal', proposal });
  return result;
}

/** A proposal as Bite reads it back in the history. */
function proposalText(proposal: ProposalCard): string {
  if (proposal.kind === 'targets') {
    const { calories, proteinG, carbsG, fatG } = proposal.to;
    return `(Proposed targets: ${calories} kcal, ${proteinG} g protein, ${carbsG} g carbs, ${fatG} g fat.)`;
  }
  const workout = proposal.workout.name ?? proposal.workout.type ?? 'a workout';
  const swaps = proposal.swaps.map((swap) => `${swap.from} → ${swap.to}`).join(', ');
  return `(Proposed for ${workout}: ${swaps}.)`;
}

/** The card of a change a tool proposed, as its result holds it. */
function proposalOf(result: unknown): ProposalCard | undefined {
  return (result as { proposal?: ProposalCard } | null)?.proposal;
}

/** The user's message as the thread keeps it: a part per photo, by its path, then its text. */
function question(threadId: number, request: ChatRequest, images: ChatPhotoPart[]) {
  const text = request.message ? [{ type: 'text', text: request.message }] : [];
  return {
    thread_id: threadId,
    role: 'user' as const,
    content: [...images, ...text] as unknown as NonNullable<Json>,
  };
}

/**
 * Keeps the message's photos, if it has any, and saves its messages with them, giving what the
 * insert gives. Photos of a message that could not be saved are removed again, as when its
 * thread was deleted meanwhile: its folder was queued for removal then (ADR 0063), and would not
 * be again.
 */
async function saveWithPhotos<Result extends { error: unknown }>(
  context: ChatContext,
  threadId: number,
  photos: CheckedPhoto[],
  insert: (images: ChatPhotoPart[]) => PromiseLike<Result>,
): Promise<Result | undefined> {
  const images = photos.length
    ? await storePhotos(context.admin, context.userId, threadId, photos)
    : [];
  if (!images) return undefined;
  const saved = await insert(images);
  if (saved.error) await removePhotos(context.admin, images);
  return saved;
}

/** Saves a question Bite gave no answer to. */
async function saveQuestion(
  context: ChatContext,
  threadId: number,
  request: ChatRequest,
  photos: CheckedPhoto[],
) {
  const saved = await saveWithPhotos(context, threadId, photos, (images) =>
    context.admin.from('coach_messages').insert(question(threadId, request, images)),
  );
  if (!saved || saved.error) logError('Could not save the question', saved?.error);
}

/**
 * Saves the user's message and Bite's answer to the thread, with why the answer stopped short if
 * it did, and gives Bite's message's id.
 */
async function saveTurn(
  context: ChatContext,
  threadId: number,
  request: ChatRequest,
  photos: CheckedPhoto[],
  turn: Turn,
  interrupted: Interruption | undefined,
): Promise<number | undefined> {
  const messages = await saveWithPhotos(context, threadId, photos, (images) =>
    context.admin
      .from('coach_messages')
      .insert([
        question(threadId, request, images),
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
          interrupted: interrupted ?? null,
        },
      ])
      .select('id')
      .order('id'),
  );
  if (!messages) return undefined;
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
  // A proposal's card is kept whatever else goes, as the chat shows it when read back.
  const proposals = trace.filter(isProposal);
  const room = MAX_PARTS - 1 - proposals.length;
  const kept: Part[] = [];
  let others = 0;
  for (const part of trace) {
    if (isProposal(part)) {
      kept.push(part);
    } else if (others < room) {
      kept.push(part);
      others++;
    }
  }
  const whole = [...kept, answer];
  if (fits(whole)) return whole;
  const without = whole.map((part) =>
    part.type === 'toolResult' && !isProposal(part) ? { ...part, result: { omitted: true } } : part,
  );
  return fits(without) ? without : [...proposals, answer];
}

function isProposal(part: Part): boolean {
  return part.type === 'toolResult' && proposalOf(part.result) !== undefined;
}

/**
 * An earlier message as Bite reads it: its text alone, a face before Bite's, as it wrote it. The
 * history reads the same parts for a line, joined by spaces (coach_message_text() in the
 * chat_history migration).
 */
function toMessage(
  row: Pick<
    Database['public']['Tables']['coach_messages']['Row'],
    'role' | 'content' | 'expression'
  >,
): Message[] {
  const parts = Array.isArray(row.content) ? row.content : [];
  const said = parts.flatMap((part) =>
    partOfType(part, 'text') && typeof part.text === 'string' ? [part.text] : [],
  );
  // What Bite proposed, so that it knows on later messages, whether or not it said a word.
  const proposed = parts.flatMap((part) => {
    const proposal = partOfType(part, 'toolResult') ? proposalOf(part.result) : undefined;
    return proposal ? [proposalText(proposal)] : [];
  });
  // A message's photos reach the model in its own turn only (ADR 0062).
  const photos = parts.filter((part) => partOfType(part, 'image')).length;
  const text = [...said.filter(Boolean), ...proposed].join('\n');
  if (row.role === 'user') {
    const sent = photos ? [photosText(photos)] : [];
    const all = [...sent, untagged(text)].filter(Boolean).join('\n');
    return all ? [{ role: 'user', parts: [{ type: 'text', text: all }] }] : [];
  }
  if (!text) return [];
  const face = marker(row.expression ?? 'neutral');
  // Bite may have repeated what the user wrote.
  return [{ role: 'model', parts: [{ type: 'text', text: `${face} ${untagged(text)}` }] }];
}

/** Whether a saved part is an object of this type. */
function partOfType(part: unknown, type: string): part is Record<string, unknown> {
  return isObject(part) && part.type === type;
}

/** Where an earlier message's photos were, as Bite reads it in later turns. */
function photosText(count: number): string {
  return count === 1 ? '(Sent a photo.)' : `(Sent ${count} photos.)`;
}

function failed(message: string, error: unknown): Response {
  logError(message, error);
  return refused('unavailable');
}

function refused(reason: ChatRefusal, details: { photo?: number } = {}): Response {
  return Response.json({ error: reason, ...details }, { status: STATUS[reason] });
}
