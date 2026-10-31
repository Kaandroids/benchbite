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
  type NoteCard,
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
  textOf,
} from '../_shared/llm/mod.ts';
import { MAX_PHOTOS, photosBodyBytes } from '../_shared/photos.ts';
import { LANGUAGES, untagged } from '../_shared/prompt.ts';
import { readJson, TOO_LARGE } from '../_shared/request.ts';
import { type Client, logError } from '../_shared/supabase.ts';
import {
  CARD_MISSING,
  NO_LOOKUPS_LEFT,
  type Expression,
  FaceReader,
  marker,
  mentionsCard,
  messageText,
  snapshotText,
  SYSTEM,
  untaggedAll,
} from './prompt.ts';
import { type CheckedPhoto, checkPhotos, removePhotos, storePhotos } from './photos.ts';
import { loadSnapshot } from './snapshot.ts';
import { DAY, TIME } from './day.ts';
import { mealCardOf, type MealCardState, mealCardStates, mealCardText } from './meal_card.ts';
import { noteOf, noteText } from './notes.ts';
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
    return refused('invalid_request', { issues: z.flattenError(parsed.error).fieldErrors });
  }
  const request = parsed.data;
  // Photos are checked before anything is sent or kept (ADR 0062).
  const photos = checkPhotos(request.photos);
  if (!Array.isArray(photos)) {
    const { reason, ...details } = photos;
    return refused(reason, details);
  }

  // The user reads only their own threads, so a thread they may not go on with is not found.
  let history: Message[] = [];
  // Whether Bite made a card earlier in the thread, which its answer may speak of (#386).
  let earlierCard = false;
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
    const results = messages.data.flatMap((row) =>
      (Array.isArray(row.content) ? row.content : []).map(resultOf),
    );
    earlierCard = results.some(isCardResult);
    const cards = await mealCardStates(context.supabase, results);
    history = messages.data.reverse().flatMap((row) => toMessage(row, cards));
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
      return answer(request, photos, { history, earlierCard }, context, send, stop).finally(() => {
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
  { history, earlierCard }: { history: Message[]; earlierCard: boolean },
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
      localTime: request.localTime,
      hasText: !!request.message?.trim(),
      savesNotes: snapshot.savesNotes,
    };

    // The rounds whose lookups ran, and the two things Bite is told at most once a turn: that its
    // answer spoke of a card it did not make (#386), and that no lookups are left (#387).
    let lookups = 0;
    let toldNoCard = false;
    let toldNoLookups = false;
    while (!(await stop.look({ now: true }))) {
      // Once the lookups are used up, Bite answers with what it has, and may not call a tool.
      const answerOnly = lookups >= MAX_TOOL_ROUNDS;
      const spoken: Part[] = [];
      const calls: Extract<Part, { type: 'toolCall' }>[] = [];
      turn.round();
      for await (const event of bite.stream({
        system: SYSTEM,
        messages,
        tools: TOOL_DEFINITIONS,
        toolChoice: answerOnly ? 'none' : 'auto',
      })) {
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
      if (stop.stopped) break;
      const said = textOf(spoken);

      if (!calls.length) {
        // The model may write of the card it means to make and end without making it. Told so
        // while it may still make one, it makes it, says why it cannot, or adds nothing. Not
        // after a card earlier in the thread, which the answer may speak of: told then, the
        // model made it again or said its answer twice.
        const noCard =
          !answerOnly &&
          !toldNoCard &&
          !earlierCard &&
          !turn.trace.some((part) => part.type === 'toolResult' && isCardResult(part.result)) &&
          mentionsCard(said, request.language);
        if (!noCard) break;
        toldNoCard = true;
        messages.push(
          { role: 'model', parts: spoken },
          { role: 'user', parts: [{ type: 'text', text: CARD_MISSING }] },
        );
        continue;
      }
      // A model may call a tool all the same once none is left: the call is not run but answered
      // so, and the model asked once more, unless this round already answered.
      if (answerOnly && (toldNoLookups || said.trim())) break;
      if (answerOnly) toldNoLookups = true;
      else lookups++;

      const results: Part[] = [];
      for (const [index, call] of calls.entries()) {
        if (await stop.look({ now: true })) break;
        const result = answerOnly
          ? { error: NO_LOOKUPS_LEFT }
          : index < MAX_CALLS_PER_ROUND
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
      // The model heeds a word beside the last results better than the request's settings.
      const lastLookup = !answerOnly && lookups === MAX_TOOL_ROUNDS;
      messages.push(
        { role: 'model', parts: [...spoken, ...calls] },
        {
          role: 'user',
          parts: lastLookup ? [...results, { type: 'text', text: NO_LOOKUPS_LEFT }] : results,
        },
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
    // A proposal, a meal or a note made is kept with its card, even if the model ended without a
    // word.
    said: turn.text.trim() !== '' || turn.trace.some(isShown),
    stopped: stop.stopped,
    finish: turn.finish,
  });
  // A new thread goes again when nothing of its message is kept, as when a photo could not be
  // kept either: it would stay empty in the history.
  const dropIfNew = async (id: number) =>
    !request.threadId && (await keepAlive(dropThread(context, id)));
  if (end.keep !== 'turn') {
    const saved =
      end.keep === 'question' &&
      (await keepAlive(saveQuestion(context, threadId, request, photos)));
    const dropped = !saved && (await dropIfNew(threadId));
    return send({ event: 'error', reason: end.reason, ...(dropped && { dropped: true }) });
  }
  const messageId = await keepAlive(
    saveTurn(context, threadId, request, photos, turn, end.interrupted),
  );
  if (!messageId) {
    await keepAlive(dropAskedNotes(context, turn.trace));
    const dropped = await dropIfNew(threadId);
    return send({ event: 'error', reason: 'not_saved', ...(dropped && { dropped: true }) });
  }
  await keepAlive(linkNotes(context, turn.trace, messageId));
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
 * reached the model, or was refused, is not kept.
 */
export function ending(
  { failure, refused, asked }: Outcome,
  answer: { said: boolean; stopped: boolean; finish?: Finish },
):
  | { keep: 'turn'; interrupted?: Interruption; reason?: ChatReason }
  | { keep: 'question' | 'nothing'; reason: ChatReason } {
  if (answer.said) {
    return { keep: 'turn', interrupted: interruption(), reason: failure };
  }
  const reason = failure ?? (answer.finish === 'blocked' ? 'blocked' : 'unavailable');
  // A question the model blocked is not kept either: sent again with every later message, it
  // would be blocked again, at a cost each time.
  const keep = asked && !refused && reason !== 'blocked' ? 'question' : 'nothing';
  return { keep, reason };

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
  // A proposed change or a meal is shown as a card under the answer; the message keeps it with the
  // result.
  const proposal = proposalOf(result);
  if (proposal) send({ event: 'proposal', proposal });
  const mealCard = mealCardOf(result);
  if (mealCard) send({ event: 'meal_card', mealCard });
  // So is a note Bite kept, as a line.
  const note = noteOf(result);
  if (note) send({ event: 'note', note });
  return result;
}

/** A proposal as Bite reads it back in the history. */
function proposalText(proposal: ProposalCard): string {
  if (proposal.kind === 'targets') {
    const { calories, proteinG, carbsG, fatG } = proposal.to;
    return `(Proposed targets: ${calories} kcal, ${proteinG} g protein, ${carbsG} g carbs, ${fatG} g fat.)`;
  }
  if (proposal.kind === 'food_log') {
    const changes = proposal.changes.map(({ food, from, to }) => {
      const was = `${food} ${from.grams} g, ${from.meal} on ${from.day}`;
      return to ? `${was} → ${to.grams} g, ${to.meal} on ${to.day}` : `${was} → removed`;
    });
    return `(Proposed food log changes: ${changes.join('; ')}.)`;
  }
  const workout = proposal.workout.name ?? proposal.workout.type ?? 'a workout';
  const swaps = proposal.swaps.map((swap) => `${swap.from} → ${swap.to}`).join(', ');
  return `(Proposed for ${workout}: ${swaps}.)`;
}

/** The card of a change a tool proposed, as its result holds it. */
function proposalOf(result: unknown): ProposalCard | undefined {
  return (result as { proposal?: ProposalCard } | null)?.proposal;
}

/** The result of a stored part of a message, when it is a tool's result. */
function resultOf(part: unknown): unknown {
  return partOfType(part, 'toolResult') ? part.result : undefined;
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

/** Saves a question Bite gave no answer to, and says whether it did. */
async function saveQuestion(
  context: ChatContext,
  threadId: number,
  request: ChatRequest,
  photos: CheckedPhoto[],
): Promise<boolean> {
  const saved = await saveWithPhotos(context, threadId, photos, (images) =>
    context.admin.from('coach_messages').insert(question(threadId, request, images)),
  );
  if (saved && !saved.error) return true;
  logError('Could not save the question', saved?.error);
  return false;
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
 * Names the answer `messageId` as where the notes Bite saved in it came from, for the notebook to
 * open the chat there. A note left without stays in the notebook, from its chat.
 */
async function linkNotes(context: ChatContext, trace: Part[], messageId: number): Promise<void> {
  const ids = notesMade(trace, ['saved', 'asked']);
  if (!ids.length) return;
  const { error } = await context.supabase
    .from('coach_notes')
    .update({ message_id: messageId })
    .in('id', ids);
  if (error) logError('Could not link the notes to their message', error);
}

/**
 * Removes the notes asked about in an answer that could not be saved: without the message, no
 * card is left for the user's yes, and they would wait unseen. Notes Bite saved stay.
 */
async function dropAskedNotes(context: ChatContext, trace: Part[]): Promise<void> {
  const ids = notesMade(trace, ['asked']);
  if (!ids.length) return;
  const { error } = await context.supabase.from('coach_notes').delete().in('id', ids);
  if (error) logError('Could not remove the notes asked about', error);
}

/** The ids of the notes a turn's tools made, in the ways `actions` names. */
function notesMade(trace: Part[], actions: NoteCard['action'][]): number[] {
  return trace.flatMap((part) => {
    const note = part.type === 'toolResult' ? noteOf(part.result) : undefined;
    return note && actions.includes(note.action) ? [note.id] : [];
  });
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
  // A proposal's or a meal's card, or a note, is kept whatever else goes, as the chat shows it when
  // read back.
  const cards = trace.filter(isShown);
  const room = MAX_PARTS - 1 - cards.length;
  const kept: Part[] = [];
  let others = 0;
  for (const part of trace) {
    if (isShown(part)) {
      kept.push(part);
    } else if (others < room) {
      kept.push(part);
      others++;
    }
  }
  const whole = [...kept, answer];
  if (fits(whole)) return whole;
  const without = whole.map((part) =>
    part.type === 'toolResult' && !isShown(part) ? { ...part, result: { omitted: true } } : part,
  );
  return fits(without) ? without : [...cards, answer];
}

/**
 * Whether a tool's result is a card Bite may speak of, a proposal's or a meal's, which an answer
 * that speaks of one without it is told of (#386). A note is no such card.
 */
function isCardResult(result: unknown): boolean {
  return proposalOf(result) !== undefined || mealCardOf(result) !== undefined;
}

/** Whether a part is the result of a proposal, a meal card or a note, which the chat shows. */
function isShown(part: Part): boolean {
  return (
    part.type === 'toolResult' && (isCardResult(part.result) || noteOf(part.result) !== undefined)
  );
}

/**
 * An earlier message as Bite reads it: its text, a face before Bite's, as it wrote it, and a line
 * for the user's photos. The app reads the photos apart from the text too, to show them
 * (messagePhotos() in src/coach/chat-photos.ts), and the history counts them
 * (coach_message_photos()), for a message of photos alone, which has no text.
 */
function toMessage(
  row: Pick<
    Database['public']['Tables']['coach_messages']['Row'],
    'role' | 'content' | 'expression'
  >,
  cards: Map<number, MealCardState>,
): Message[] {
  const parts = Array.isArray(row.content) ? row.content : [];
  const said = parts.flatMap((part) =>
    partOfType(part, 'text') && typeof part.text === 'string' ? [part.text] : [],
  );
  // What Bite proposed and the meals it estimated, with where they stand, so that it knows on
  // later messages, whether or not it said a word.
  const proposed = parts.flatMap((part) => {
    const result = resultOf(part);
    const proposal = proposalOf(result);
    if (proposal) return [proposalText(proposal)];
    const card = mealCardOf(result);
    if (card) return [mealCardText(card, cards.get(card.id))];
    const note = noteOf(result);
    return note ? [noteText(note)] : [];
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

/** A refusal, with the photo it is about or what is wrong with the request, when it is told. */
function refused(
  reason: ChatRefusal,
  details: { photo?: number; issues?: Record<string, string[] | undefined> } = {},
): Response {
  return Response.json({ error: reason, ...details }, { status: STATUS[reason] });
}
