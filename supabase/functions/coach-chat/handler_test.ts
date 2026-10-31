import { assertEquals } from '@std/assert';

import { toBase64 } from '../_shared/base64_bytes.ts';
import { MEDIA_BUCKET } from '../_shared/coach/media.ts';
import { FAKE_USAGE, FakeModel } from '../_shared/llm/fake.ts';
import { ModelError, type ModelRequest, type StreamEvent } from '../_shared/llm/mod.ts';
import type { ChatContext, ChatEvent } from './handler.ts';
import { content, ending, handleChatRequest } from './handler.ts';
import { CARD_MISSING, NO_LOOKUPS_LEFT, SAID_ALREADY } from './prompt.ts';
import { EOI, EXIF, FRAME, JFIF, jpeg, PLAIN_JPEG, SCAN, SOI } from './test-photos.ts';

type Row = Record<string, unknown>;

/** How the database and storage fail, beyond what they refuse anyway. */
type Failures = {
  /** A thread deleted while Bite answered, whose messages the foreign key then refuses. */
  deletedThread?: number;
  /** The uploads, counted from 0, that storage fails. */
  failingUploads?: number[];
};

/**
 * A database for the chat: tables with their rows, functions with what they return, or a
 * function giving it, and what is inserted, updated and deleted, which the service role writes. Every
 * query resolves with all of a table's rows. Like the real ones, it keeps the threads there are,
 * refuses messages of a thread that is not or is gone and more parts than a message may hold, and
 * its storage has the `coach-media` bucket alone, which takes new JPEG files of at most 1.5 MB, and
 * keeps what is in it.
 */
function database(
  rpc: Record<string, unknown> = {},
  tables: Record<string, Row[]> = {},
  { deletedThread, failingUploads = [] }: Failures = {},
) {
  const inserted: { table: string; rows: Row[] }[] = [];
  const updated: { table: string; values: Row }[] = [];
  const deleted: string[] = [];
  const objects = new Map<string, Uint8Array>();
  const removed: string[] = [];
  let uploads = 0;
  let nextId = 100;
  const threads = new Set((tables.coach_threads ?? []).map((row) => row.id as number));
  const refused = (code: string, message: string) => ({ data: null, error: { code, message } });
  const query = (table: string, rows?: Row[]) => {
    const result = () => {
      const data = rows ?? tables[table] ?? [];
      return { data, error: null };
    };
    const builder: Record<string, unknown> = {
      then: (resolve: (value: unknown) => void) => resolve(result()),
      maybeSingle: () => Promise.resolve({ data: result().data[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: result().data[0], error: null }),
    };
    for (const method of ['select', 'eq', 'is', 'in', 'ilike', 'order', 'limit']) {
      builder[method] = () => builder;
    }
    return builder;
  };
  const client = {
    from: (table: string) => ({
      ...query(table),
      insert: (rows: Row | Row[]) => {
        const given = Array.isArray(rows) ? rows : [rows];
        if (table === 'coach_messages') {
          const gone = (row: Row) =>
            row.thread_id === deletedThread || !threads.has(row.thread_id as number);
          const error = given.some(gone)
            ? refused('23503', 'violates foreign key constraint')
            : given.some((row) => !Array.isArray(row.content) || row.content.length > 50)
              ? refused('23514', 'violates check constraint')
              : undefined;
          if (error) {
            const failed = { then: (resolve: (value: unknown) => void) => resolve(error) };
            const builder = { ...failed, select: () => builder, order: () => builder };
            return builder;
          }
        }
        const list = given.map((row) => ({ ...row, id: nextId++ }));
        if (table === 'coach_threads') list.forEach((row) => threads.add(row.id));
        inserted.push({ table, rows: list });
        return query(table, list);
      },
      update: (values: Row) => {
        updated.push({ table, values });
        return query(table);
      },
      delete: () => {
        const values: unknown[] = [];
        const filter = {
          eq: (_column: string, value: unknown) => {
            values.push(value);
            return filter;
          },
          in: (_column: string, list: unknown[]) => {
            values.push(...list);
            return filter;
          },
          then: (resolve: (value: unknown) => void) => {
            if (table === 'coach_threads') threads.delete(values[0] as number);
            deleted.push([table, ...values].join(' '));
            resolve({ error: null });
          },
        };
        return filter;
      },
    }),
    rpc: (name: string) => {
      const value = name in rpc ? rpc[name] : name === 'ai_access' ? { allowed: true } : [];
      return Promise.resolve({
        data: typeof value === 'function' ? value() : value,
        error: null,
      });
    },
    storage: {
      from: (bucket: string) => ({
        upload: (
          path: string,
          body: Uint8Array,
          options: { contentType?: string; upsert?: boolean },
        ) => {
          const upload = uploads++;
          if (bucket !== MEDIA_BUCKET) return Promise.resolve(refused('404', 'Bucket not found'));
          if (options.contentType !== 'image/jpeg') {
            return Promise.resolve(refused('415', 'mime type not supported'));
          }
          if (body.byteLength > 1_500_000) return Promise.resolve(refused('413', 'Too large'));
          if (objects.has(path) && !options.upsert) {
            return Promise.resolve(refused('409', 'The resource already exists'));
          }
          if (failingUploads.includes(upload)) return Promise.resolve(refused('500', 'down'));
          objects.set(path, body);
          return Promise.resolve({ data: { path }, error: null });
        },
        remove: (paths: string[]) => {
          if (bucket !== MEDIA_BUCKET) return Promise.resolve(refused('404', 'Bucket not found'));
          const gone = paths.filter((path) => objects.delete(path));
          removed.push(...gone);
          return Promise.resolve({ data: gone.map((name) => ({ name })), error: null });
        },
      }),
    },
  } as unknown as ChatContext['supabase'];
  return { client, inserted, updated, deleted, objects, removed, threads };
}

const STARTED = { allowed: true, reason: null, call_id: 'call-1', max_output_tokens: 2048 };

function context(
  model: FakeModel,
  rpc: Record<string, unknown> = {},
  tables = {},
  failures: Failures = {},
) {
  const db = database(
    { start_ai_call: STARTED, count_ai_call: STARTED, record_ai_usage: 0.001, ...rpc },
    tables,
    failures,
  );
  const ctx: ChatContext = { supabase: db.client, admin: db.client, userId: 'user-1', model };
  return { ...db, ctx };
}

const ask = (body: unknown) =>
  new Request('http://localhost/coach-chat', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const MESSAGE = { message: 'Did I eat enough protein?', language: 'en', today: '2026-10-30' };

/** The events of a streamed answer. */
async function events(response: Response): Promise<ChatEvent[]> {
  const text = await response.text();
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const [event, data] = block.split('\n');
      return { event: event.slice(7), ...JSON.parse(data.slice(6)) } as ChatEvent;
    });
}

Deno.test('answers a new message in a new thread, with its expression first', async () => {
  const model = new FakeModel([
    { type: 'text', text: '[[hap' },
    { type: 'text', text: 'py]] Yes, ' },
    { type: 'text', text: '140 g!' },
  ]);
  const { ctx, inserted } = context(model);

  const response = await handleChatRequest(ask(MESSAGE), ctx);

  assertEquals(response.headers.get('content-type'), 'text/event-stream');
  assertEquals(await events(response), [
    // The thread first, so that the app keeps it however the answer ends.
    { event: 'thread', threadId: 100 },
    { event: 'expression', expression: 'happy' },
    { event: 'text', text: 'Yes, ' },
    { event: 'text', text: '140 g!' },
    { event: 'done', threadId: 100, messageId: 102 },
  ]);
  assertEquals(inserted[0], { table: 'coach_threads', rows: [{ user_id: 'user-1', id: 100 }] });
  assertEquals(
    inserted[1].rows.map(({ role, content, expression }) => ({ role, content, expression })),
    [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Did I eat enough protein?' }],
        expression: undefined,
      },
      { role: 'bite', content: [{ type: 'text', text: 'Yes, 140 g!' }], expression: 'happy' },
    ],
  );
  assertEquals(inserted[1].rows[1].input_tokens, FAKE_USAGE.inputTokens);
});

Deno.test('tells the model who it is and what the user is up to', async () => {
  const model = new FakeModel([{ type: 'text', text: '[[neutral]] Hi.' }]);
  const { ctx } = context(model, {
    day_nutrition: [
      {
        day: '2026-10-30',
        kcal: 1450,
        protein_g: 95,
        carbs_g: 140,
        fat_g: 50,
        target_calories: 2300,
        target_protein_g: 160,
        target_carbs_g: 250,
        target_fat_g: 70,
      },
    ],
  });

  await (await handleChatRequest(ask({ ...MESSAGE, language: 'tr' }), ctx)).text();

  const { system, tools, messages } = model.requests[0];
  // The rules alone, the same for everyone; the snapshot goes with the message, as data.
  assertEquals(system!.startsWith('You are Bite'), true);
  assertEquals(system!.includes('Eaten today'), false);
  assertEquals(tools?.map((tool) => tool.name).includes('get_meal_log'), true);
  const [snapshot, message] = messages[0].parts as { type: 'text'; text: string }[];
  assertEquals(snapshot.text.startsWith('<snapshot>'), true);
  assertEquals(snapshot.text.includes('Reply in: Turkish'), true);
  assertEquals(snapshot.text.includes('Eaten today: 1450 kcal · 95 g protein'), true);
  assertEquals(message, {
    type: 'text',
    text: '<message>\nDid I eat enough protein?\n</message>',
  });
});

Deno.test('looks things up with a tool, then answers', async () => {
  const model = new FakeModel(
    [{ type: 'toolCall', id: 'c1', name: 'get_records', args: {}, signature: 's1' }],
    [{ type: 'text', text: '[[surprised]] A new squat record!' }],
  );
  const { ctx, inserted } = context(model, {
    start_ai_call: STARTED,
    record_history: [
      { exercise_id: 'squat', kind: 'weight', achieved_on: '2026-10-29', weight_kg: 120 },
    ],
  });

  const answer = await events(await handleChatRequest(ask(MESSAGE), ctx));

  assertEquals(answer.slice(0, 4), [
    { event: 'thread', threadId: 100 },
    { event: 'tool_start', name: 'get_records' },
    { event: 'tool_end', name: 'get_records' },
    { event: 'expression', expression: 'surprised' },
  ]);
  const second = model.requests[1].messages;
  assertEquals(second[1], {
    role: 'model',
    parts: [{ type: 'toolCall', id: 'c1', name: 'get_records', args: {}, signature: 's1' }],
  });
  assertEquals(second[2].parts[0].type, 'toolResult');
  assertEquals(inserted[1].rows[1].content, [
    { type: 'toolCall', id: 'c1', name: 'get_records', args: {}, signature: 's1' },
    {
      type: 'toolResult',
      id: 'c1',
      name: 'get_records',
      result: [
        {
          exercise: 'squat',
          kind: 'weight',
          on: '2026-10-29',
          value: undefined,
          previous: undefined,
          weightKg: 120,
          reps: undefined,
          seconds: undefined,
          meters: undefined,
        },
      ],
    },
    { type: 'text', text: 'A new squat record!' },
  ]);
  // Both requests are counted.
  assertEquals(inserted[1].rows[1].input_tokens, 2 * FAKE_USAGE.inputTokens);
});

Deno.test('says why when the user may not use Bite, and keeps nothing of it', async () => {
  const { ctx, inserted, deleted } = context(new FakeModel(), {
    ai_access: { allowed: false, reason: 'limit_reached' },
  });

  assertEquals(await events(await handleChatRequest(ask(MESSAGE), ctx)), [
    { event: 'error', reason: 'limit_reached' },
  ]);
  // Nothing is written before the access is checked.
  assertEquals([inserted, deleted], [[], []]);
});

Deno.test('goes on with a thread, reading its earlier messages as text', async () => {
  const model = new FakeModel([{ type: 'text', text: '[[happy]] Sure.' }]);
  const { ctx, inserted } = context(
    model,
    {},
    {
      coach_threads: [{ id: 7 }],
      coach_messages: [
        {
          role: 'bite',
          expression: 'happy',
          content: [
            { type: 'toolCall', name: 'get_plan', args: {} },
            { type: 'text', text: 'Push day.' },
          ],
        },
        { role: 'user', content: [{ type: 'text', text: 'What is today?' }] },
      ],
    },
  );

  const answer = await events(await handleChatRequest(ask({ ...MESSAGE, threadId: 7 }), ctx));

  // Newest first from the database, oldest first to the model, Bite's with its face.
  assertEquals(model.requests[0].messages.slice(0, 2), [
    { role: 'user', parts: [{ type: 'text', text: 'What is today?' }] },
    { role: 'model', parts: [{ type: 'text', text: '[[happy]] Push day.' }] },
  ]);
  assertEquals(answer.at(-1), { event: 'done', threadId: 7, messageId: 101 });
  assertEquals(
    inserted.map(({ table }) => table),
    ['coach_messages'],
  );
});

Deno.test('refuses a thread the user cannot read, and a request that is not valid', async () => {
  const { ctx } = context(new FakeModel(), {}, { coach_threads: [] });

  const missing = await handleChatRequest(ask({ ...MESSAGE, threadId: 7 }), ctx);
  assertEquals([missing.status, await missing.json()], [404, { error: 'thread_not_found' }]);

  const invalid = await handleChatRequest(ask({ ...MESSAGE, language: 'fr' }), ctx);
  assertEquals(invalid.status, 400);
  const notJson = await handleChatRequest(ask('{'), ctx);
  assertEquals(notJson.status, 400);
  const get = await handleChatRequest(new Request('http://localhost/coach-chat'), ctx);
  assertEquals(get.status, 405);
});

Deno.test('drops a new thread when the request is refused after it began', async () => {
  const { ctx, inserted, deleted } = context(new FakeModel(), {
    start_ai_call: {
      allowed: false,
      reason: 'call_in_progress',
      call_id: null,
      max_output_tokens: null,
    },
  });

  assertEquals(await events(await handleChatRequest(ask(MESSAGE), ctx)), [
    { event: 'thread', threadId: 100 },
    { event: 'error', reason: 'call_in_progress', dropped: true },
  ]);
  assertEquals(
    inserted.map(({ table }) => table),
    ['coach_threads'],
  );
  assertEquals(deleted, ['coach_threads 100']);
});

Deno.test("takes a later request's face off, and goes on after a space", async () => {
  const model = new FakeModel(
    [
      { type: 'text', text: '[[neutral]] Let me look.' },
      { type: 'toolCall', name: 'get_records', args: {} },
    ],
    [{ type: 'text', text: '[[happy]] You hit 120 kg!' }],
  );
  const { ctx, inserted } = context(model);

  const answer = await events(await handleChatRequest(ask(MESSAGE), ctx));

  assertEquals(
    answer.filter((e) => e.event === 'expression'),
    [{ event: 'expression', expression: 'neutral' }],
  );
  const said = answer.flatMap((e) => (e.event === 'text' ? [e.text] : [])).join('');
  assertEquals(said, 'Let me look. You hit 120 kg!');
  assertEquals((inserted[1].rows[1].content as { text?: string }[]).at(-1)?.text, said);
});

Deno.test('keeps nothing of a question the model blocked', async () => {
  const blocked = context(new FakeModel({ parts: [], usage: FAKE_USAGE, finish: 'blocked' }));
  assertEquals(await events(await handleChatRequest(ask(MESSAGE), blocked.ctx)), [
    { event: 'thread', threadId: 100 },
    { event: 'error', reason: 'blocked', dropped: true },
  ]);
  assertEquals(blocked.deleted, ['coach_threads 100']);
});

Deno.test('says why when an answer comes without text, and keeps the question', async () => {
  const faceOnly = context(new FakeModel([{ type: 'text', text: '[[sad]]' }]));
  assertEquals((await events(await handleChatRequest(ask(MESSAGE), faceOnly.ctx))).at(-1), {
    event: 'error',
    reason: 'unavailable',
  });
  // The question stays in its thread without an answer, as the app shows it.
  assertEquals(
    faceOnly.inserted.map(({ table }) => table),
    ['coach_threads', 'coach_messages'],
  );
  assertEquals(
    faceOnly.inserted[1].rows.map(({ role }) => role),
    ['user'],
  );
  assertEquals(faceOnly.deleted, []);
});

/** A model the provider refuses outright, as a token count over its rate: nothing is billed. */
class RateLimitedModel extends FakeModel {
  override countTokens(_request: ModelRequest): Promise<number> {
    return Promise.reject(
      new ModelError('rate limited', { status: 429, retryable: true, billed: false }),
    );
  }
}

Deno.test('keeps nothing when the provider refuses the request outright', async () => {
  const { ctx, inserted, deleted } = context(new RateLimitedModel());

  assertEquals(await events(await handleChatRequest(ask(MESSAGE), ctx)), [
    { event: 'thread', threadId: 100 },
    { event: 'error', reason: 'unavailable', dropped: true },
  ]);
  assertEquals(
    inserted.map(({ table }) => table),
    ['coach_threads'],
  );
  assertEquals(deleted, ['coach_threads 100']);
});

Deno.test('leaves a thread to drop that another request answered in meanwhile', async () => {
  const { ctx, deleted } = context(new RateLimitedModel(), {}, { coach_messages: [{ id: 5 }] });

  const answer = await events(await handleChatRequest(ask(MESSAGE), ctx));

  assertEquals(answer.at(-1), { event: 'error', reason: 'unavailable' });
  assertEquals(deleted, []);
});

Deno.test('keeps what was said when the budget runs out after a lookup', async () => {
  const model = new FakeModel([
    { type: 'text', text: '[[neutral]] Let me check.' },
    { type: 'toolCall', name: 'get_records', args: {} },
  ]);
  const { ctx, inserted } = context(model);
  // The budget is enough for the check before the thread and the first request, not the second.
  const client = ctx.supabase as unknown as { rpc: (name: string, args?: unknown) => unknown };
  const rpc = client.rpc;
  let asked = 0;
  client.rpc = (name, args) =>
    name === 'ai_access' && asked++ > 1
      ? Promise.resolve({ data: { allowed: false, reason: 'limit_reached' }, error: null })
      : rpc(name, args);

  const answer = await events(await handleChatRequest(ask(MESSAGE), ctx));

  assertEquals(answer.at(-1), {
    event: 'done',
    threadId: 100,
    messageId: 102,
    interrupted: 'refused',
    reason: 'limit_reached',
  });
  assertEquals(inserted.length, 2);
});

Deno.test('says an answer cut at the token limit stopped short', async () => {
  const cut = {
    parts: [{ type: 'text' as const, text: '[[happy]] Your week was' }],
    usage: FAKE_USAGE,
    finish: 'length' as const,
  };
  const { ctx, inserted } = context(new FakeModel(cut));

  const answer = await events(await handleChatRequest(ask(MESSAGE), ctx));

  assertEquals(answer.at(-1), { event: 'done', threadId: 100, messageId: 102, interrupted: 'cut' });
  assertEquals(inserted[1].rows[1].interrupted, 'cut');
});

Deno.test('says an answer the model broke off failed, and keeps what was said', async () => {
  // The second request finds no turn left, and fails.
  const model = new FakeModel([
    { type: 'text', text: '[[neutral]] Let me check.' },
    { type: 'toolCall', name: 'get_records', args: {} },
  ]);
  const { ctx, inserted } = context(model);

  const answer = await events(await handleChatRequest(ask(MESSAGE), ctx));

  assertEquals(answer.at(-1), {
    event: 'done',
    threadId: 100,
    messageId: 102,
    interrupted: 'failed',
    reason: 'unavailable',
  });
  assertEquals(inserted.length, 2);
});

/** A model whose every request fails at the provider, after it was made. */
class FailingModel extends FakeModel {
  override stream(_request: ModelRequest): AsyncIterable<StreamEvent> {
    return {
      [Symbol.asyncIterator]: () => ({
        next: () =>
          Promise.reject(
            new ModelError('overloaded', { status: 503, retryable: true, billed: true }),
          ),
      }),
    };
  }
}

Deno.test('keeps the question when the model fails before a word', async () => {
  const { ctx, inserted, deleted } = context(new FailingModel());

  assertEquals(await events(await handleChatRequest(ask(MESSAGE), ctx)), [
    { event: 'thread', threadId: 100 },
    { event: 'error', reason: 'unavailable' },
  ]);
  assertEquals(
    inserted.map(({ table }) => table),
    ['coach_threads', 'coach_messages'],
  );
  assertEquals(deleted, []);
});

Deno.test('drops a new thread, and says so, when the model could not be asked', async () => {
  const { ctx, inserted, deleted } = context(new FakeModel());
  const client = ctx.supabase as unknown as { rpc: (name: string, args?: unknown) => unknown };
  const rpc = client.rpc;
  client.rpc = (name, args) =>
    name === 'start_ai_call'
      ? Promise.resolve({ data: null, error: { message: 'down' } })
      : rpc(name, args);

  assertEquals(await events(await handleChatRequest(ask(MESSAGE), ctx)), [
    { event: 'thread', threadId: 100 },
    { event: 'error', reason: 'unavailable', dropped: true },
  ]);
  assertEquals(
    inserted.map(({ table }) => table),
    ['coach_threads'],
  );
  assertEquals(deleted, ['coach_threads 100']);
});

Deno.test('keeps nothing when the answer is stopped before anything began', async () => {
  const model = new FakeModel([{ type: 'text', text: '[[happy]] Sure.' }]);
  const { ctx, inserted, deleted } = context(model);

  const response = await handleChatRequest(ask(MESSAGE), ctx);
  await response.body!.cancel();
  for (let tick = 0; tick < 20; tick++) await new Promise((resolve) => setTimeout(resolve, 0));

  // Not even a thread: the stop is seen before one would be made.
  assertEquals([model.requests, inserted, deleted], [[], [], []]);
});

const REQUEST = '7b0f4d0e-2f6c-4c1a-9d43-5d0a8f1c2e11';

Deno.test('stops when the app says so, though its request was not closed', async () => {
  const model = new FakeModel([{ type: 'text', text: '[[happy]] Sure.' }]);
  const { ctx, inserted, deleted } = context(
    model,
    {},
    {
      coach_stops: [{ request_id: REQUEST }],
    },
  );

  const answer = await events(
    await handleChatRequest(ask({ ...MESSAGE, requestId: REQUEST }), ctx),
  );

  assertEquals([answer, model.requests, inserted], [[], [], []]);
  // Its stop goes once the answer ended, and only the user's own.
  assertEquals(deleted, [`coach_stops ${REQUEST} user-1`]);
});

/** A model whose answer the app stops once `when` holds for one of its events. */
function stoppedWhen(model: FakeModel, stops: Row[], when: (event: StreamEvent) => boolean) {
  const stream = model.stream.bind(model);
  model.stream = async function* (request) {
    for await (const event of stream(request)) {
      yield event;
      if (when(event)) stops.push({ request_id: REQUEST });
    }
  };
}

Deno.test('keeps what was said when the app stops the answer as it comes', async () => {
  const stops: Row[] = [];
  const model = new FakeModel([
    { type: 'text', text: '[[happy]] Rest ' },
    { type: 'text', text: 'is key.' },
  ]);
  const { ctx, inserted } = context(model, {}, { coach_stops: stops });
  // The app stops once the first words came, and the next look sees it.
  stoppedWhen(model, stops, (event) => event.type === 'text');

  const answer = await events(
    await handleChatRequest(ask({ ...MESSAGE, requestId: REQUEST }), { ...ctx, stopCheckMs: 0 }),
  );

  assertEquals(answer.at(-1), {
    event: 'done',
    threadId: 100,
    messageId: 102,
    interrupted: 'stopped',
  });
  assertEquals((inserted[1].rows[1].content as { text?: string }[]).at(-1)?.text, 'Rest');
  // and that it was stopped, for when the chat is read back.
  assertEquals(inserted[1].rows[1].interrupted, 'stopped');
});

Deno.test('keeps an answer whole when its stop comes with its end', async () => {
  const stops: Row[] = [];
  const model = new FakeModel([{ type: 'text', text: '[[happy]] Rest is key.' }]);
  const { ctx, inserted } = context(model, {}, { coach_stops: stops });
  stoppedWhen(model, stops, (event) => event.type === 'text');

  const answer = await events(
    await handleChatRequest(ask({ ...MESSAGE, requestId: REQUEST }), { ...ctx, stopCheckMs: 0 }),
  );

  assertEquals(answer.at(-1), { event: 'done', threadId: 100, messageId: 102 });
  // What the round used is kept with it.
  assertEquals(inserted[1].rows[1].output_tokens, FAKE_USAGE.outputTokens);
  assertEquals(inserted[1].rows[1].interrupted, null);
});

Deno.test('makes no more lookups once the app stops the answer', async () => {
  const stops: Row[] = [];
  const calls = ['oats', 'rice', 'eggs'].map((query, i) => ({
    type: 'toolCall' as const,
    id: `c${i}`,
    name: 'search_foods',
    args: { query },
  }));
  const model = new FakeModel(calls);
  let searched = 0;
  // The app stops while the first lookup runs.
  const search = () => {
    searched++;
    stops.push({ request_id: REQUEST });
    return [];
  };
  const { ctx, inserted } = context(model, { search_foods: search }, { coach_stops: stops });

  const answer = await events(
    await handleChatRequest(ask({ ...MESSAGE, requestId: REQUEST }), ctx),
  );

  assertEquals([searched, model.requests.length], [1, 1]);
  assertEquals(answer.filter((e) => e.event === 'tool_start').length, 1);
  // Nothing was said, so only the question is kept, without lookups left half done.
  assertEquals(
    inserted.map((i) => i.table),
    ['coach_threads', 'coach_messages'],
  );
  assertEquals(inserted[1].rows.length, 1);
});

Deno.test('takes only a request id that is one', async () => {
  const { ctx } = context(new FakeModel());
  const response = await handleChatRequest(ask({ ...MESSAGE, requestId: 'not-an-id' }), ctx);
  assertEquals(response.status, 400);
});

Deno.test('answers more lookups than a round may make with an error', async () => {
  const many = Array.from({ length: 7 }, (_, i) => ({
    type: 'toolCall' as const,
    id: `c${i}`,
    name: 'search_foods',
    args: { query: 'oats' },
  }));
  const model = new FakeModel(many, [{ type: 'text', text: '[[neutral]] Oats.' }]);
  const { ctx } = context(model);

  const answer = await events(await handleChatRequest(ask(MESSAGE), ctx));

  assertEquals(answer.filter((e) => e.event === 'tool_start').length, 5);
  const results = model.requests[1].messages[2].parts as { result: unknown }[];
  assertEquals(results.at(-1)?.result, { error: 'At most 5 lookups at once; ask for fewer.' });
});

Deno.test('tells Bite when its lookups are used up, and asks once more for an answer', async () => {
  const search = (id: string) => [
    { type: 'toolCall' as const, id, name: 'search_exercises', args: { query: 'press' } },
  ];
  const model = new FakeModel(...['c1', 'c2', 'c3', 'c4', 'c5'].map(search), [
    { type: 'text', text: '[[sad]] I found nothing to swap it for.' },
  ]);
  const { ctx, inserted } = context(model);

  const answer = await events(await handleChatRequest(ask(MESSAGE), ctx));

  assertEquals(
    model.requests.map((request) => request.toolChoice),
    ['auto', 'auto', 'auto', 'auto', 'none', 'none'],
  );
  assertEquals(model.requests[4].messages.at(-1)?.parts.at(-1), {
    type: 'text',
    text: NO_LOOKUPS_LEFT,
  });
  // The call the last round made anyway is not run, but answered.
  assertEquals(answer.filter((e) => e.event === 'tool_start').length, 4);
  assertEquals(model.requests[5].messages.at(-1)?.parts, [
    {
      type: 'toolResult',
      id: 'c5',
      name: 'search_exercises',
      result: { error: NO_LOOKUPS_LEFT },
    },
  ]);
  assertEquals(
    (inserted[1].rows[1].content as { text?: string }[]).at(-1)?.text,
    'I found nothing to swap it for.',
  );
});

Deno.test('asks once more though Bite said something before its lookups', async () => {
  const search = (id: string) => [
    { type: 'toolCall' as const, id, name: 'search_exercises', args: { query: 'press' } },
  ];
  const model = new FakeModel(
    [{ type: 'text', text: '[[neutral]] Let me check your workouts.' }, ...search('c1')],
    ...['c2', 'c3', 'c4', 'c5'].map(search),
    [{ type: 'text', text: 'I found nothing to swap it for.' }],
  );
  const { ctx, inserted } = context(model);

  await events(await handleChatRequest(ask(MESSAGE), ctx));

  assertEquals(model.requests.length, 6);
  assertEquals(
    (inserted[1].rows[1].content as { text?: string }[]).at(-1)?.text,
    'Let me check your workouts. I found nothing to swap it for.',
  );
});

Deno.test('tells Bite of a missing card only while it may still make one', async () => {
  const search = (id: string) => [
    { type: 'toolCall' as const, id, name: 'search_exercises', args: { query: 'press' } },
  ];
  const late = new FakeModel(...['c1', 'c2', 'c3', 'c4'].map(search), [
    { type: 'text', text: '[[happy]] Here is the card.' },
  ]);
  await events(await handleChatRequest(ask(MESSAGE), context(late).ctx));
  assertEquals(late.requests.length, 5);

  // After three lookups one is left, which the card is made with.
  const lastLookup = new FakeModel(
    ...['c1', 'c2', 'c3'].map(search),
    [{ type: 'text', text: '[[happy]] Here is the card.' }],
    [{ type: 'text', text: 'Sorry, I could not make it.' }],
  );
  await events(await handleChatRequest(ask(MESSAGE), context(lastLookup).ctx));
  assertEquals(lastLookup.requests[4].toolChoice, 'auto');
});

Deno.test('asks only once more when Bite still calls a tool', async () => {
  const search = (id: string) => [
    { type: 'toolCall' as const, id, name: 'search_exercises', args: { query: 'press' } },
  ];
  const model = new FakeModel(...['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'].map(search));
  const { ctx } = context(model);

  await events(await handleChatRequest(ask(MESSAGE), ctx));

  assertEquals(model.requests.length, 6);
});

Deno.test('keeps a message within what a message may hold', () => {
  const call = { type: 'toolCall' as const, name: 'get_meal_log', args: { day: '2026-10-01' } };
  const big = { type: 'toolResult' as const, name: 'get_meal_log', result: 'x'.repeat(70_000) };
  const small = { type: 'toolResult' as const, name: 'get_meal_log', result: [] };

  assertEquals(content([call, small], 'Hi').length, 3);
  assertEquals(content([call, big], 'Hi')[1], { ...big, result: { omitted: true } });
  assertEquals(content(Array(60).fill(call), 'Hi').length, 50);
});

Deno.test('keeps what came of a message, and says why it ended', () => {
  const answer = { said: false, stopped: false, finish: 'stop' as const };
  const asked = { refused: false, asked: true };
  const notAsked = { failure: 'unavailable' as const, refused: false, asked: false };
  const refused = { failure: 'limit_reached' as const, refused: true, asked: false };

  assertEquals(ending(asked, { ...answer, said: true }), {
    keep: 'turn',
    interrupted: undefined,
    reason: undefined,
  });
  assertEquals(ending(asked, { ...answer, said: true, finish: 'length' }).keep, 'turn');
  assertEquals(ending({ ...refused, asked: true }, { ...answer, said: true }), {
    keep: 'turn',
    interrupted: 'refused',
    reason: 'limit_reached',
  });
  assertEquals(ending(asked, { ...answer, said: true, stopped: true }), {
    keep: 'turn',
    interrupted: 'stopped',
    reason: undefined,
  });
  // Without text: the question once the model was asked, else nothing.
  assertEquals(ending(asked, { ...answer, finish: 'stop' }), {
    keep: 'question',
    reason: 'unavailable',
  });
  assertEquals(ending(asked, { ...answer, finish: 'blocked' }), {
    keep: 'nothing',
    reason: 'blocked',
  });
  assertEquals(ending(notAsked, answer), {
    keep: 'nothing',
    reason: 'unavailable',
  });
  assertEquals(ending(refused, answer), {
    keep: 'nothing',
    reason: 'limit_reached',
  });
});

Deno.test('shows a proposed change as a card, and keeps it with the answer', async () => {
  const to = { calories: 2100, proteinG: 150, carbsG: 210, fatG: 70 };
  const model = new FakeModel(
    [{ type: 'toolCall', id: 'c1', name: 'propose_targets_change', args: to }],
    [{ type: 'text', text: '[[happy]] Here is what I would change.' }],
  );
  const { ctx, inserted } = context(model, {
    propose_coach_change: 42,
    my_nutrition_targets: { calories: 1900, protein_g: 130, carbs_g: 200, fat_g: 60 },
  });

  const answer = await events(await handleChatRequest(ask(MESSAGE), ctx));

  const proposal = {
    kind: 'targets' as const,
    id: 42,
    from: { calories: 1900, proteinG: 130, carbsG: 200, fatG: 60 },
    to,
  };
  assertEquals(
    answer.filter((e) => e.event === 'proposal'),
    [{ event: 'proposal', proposal }],
  );
  // The message keeps the card in its lookup's result, to show it when the chat is read back.
  const content = inserted[1].rows[1].content as { type: string; result?: unknown }[];
  assertEquals(content.find((part) => part.type === 'toolResult')?.result, { proposal });
});

Deno.test('keeps a proposed change though the model said nothing after it', async () => {
  const to = { calories: 2100, proteinG: 150, carbsG: 210, fatG: 70 };
  const model = new FakeModel(
    [{ type: 'toolCall', id: 'c1', name: 'propose_targets_change', args: to }],
    [],
  );
  const { ctx, inserted } = context(model, { propose_coach_change: 42 });

  const answer = await events(await handleChatRequest(ask(MESSAGE), ctx));

  assertEquals(answer.at(-1), { event: 'done', threadId: 100, messageId: 102 });
  assertEquals(inserted[1].rows.length, 2);
});

Deno.test(
  'tells Bite once when it speaks of a card it did not make, which it then makes',
  async () => {
    const to = { calories: 2100, proteinG: 150, carbsG: 210, fatG: 70 };
    const model = new FakeModel(
      [{ type: 'text', text: "[[happy]] I've proposed new targets." }],
      [{ type: 'toolCall', id: 'c1', name: 'propose_targets_change', args: to }],
      [{ type: 'text', text: '[[happy]] Here it is.' }],
    );
    const { ctx } = context(model, { propose_coach_change: 42 });

    const answer = await events(await handleChatRequest(ask(MESSAGE), ctx));

    assertEquals(model.requests[1].messages.slice(-2), [
      { role: 'model', parts: [{ type: 'text', text: "[[happy]] I've proposed new targets." }] },
      {
        role: 'user',
        parts: [{ type: 'text', text: CARD_MISSING }],
      },
    ]);
    assertEquals(answer.filter((e) => e.event === 'proposal').length, 1);
    assertEquals(model.requests.length, 3);
  },
);

Deno.test('tells Bite of a missing card only once, and not when it made one', async () => {
  const twice = new FakeModel(
    [{ type: 'text', text: '[[happy]] Here is the card.' }],
    [{ type: 'text', text: '[[happy]] Tap the card.' }],
  );
  await events(await handleChatRequest(ask(MESSAGE), context(twice).ctx));
  assertEquals(twice.requests.length, 2);

  const to = { calories: 2100, proteinG: 150, carbsG: 210, fatG: 70 };
  const made = new FakeModel(
    [{ type: 'toolCall', id: 'c1', name: 'propose_targets_change', args: to }],
    [{ type: 'text', text: '[[happy]] Here is the card.' }],
  );
  await events(
    await handleChatRequest(ask(MESSAGE), context(made, { propose_coach_change: 42 }).ctx),
  );
  assertEquals(made.requests.length, 2);
});

/** A profile the snapshot reads whole. */
const PROFILE = {
  birth_year: 1996,
  sex: 'female',
  height_cm: 165,
  weight_unit: 'kg',
  training_days: [1, 4],
  session_minutes: 45,
};

const SAVE_NOTE = {
  type: 'toolCall' as const,
  id: 'c1',
  name: 'save_note',
  args: { category: 'allergy', text: 'Allergic to kiwi' },
};

Deno.test('shows a note Bite kept, and names the answer it came from', async () => {
  const model = new FakeModel(
    [SAVE_NOTE],
    [{ type: 'text', text: "[[happy]] Got it, I'll keep that in mind." }],
  );
  const { ctx, updated } = context(
    model,
    {},
    { profiles: [{ ...PROFILE, coach_saves_notes: true }] },
  );

  const answer = await events(await handleChatRequest(ask(MESSAGE), ctx));

  const shown = answer.find((e) => e.event === 'note') as Extract<ChatEvent, { event: 'note' }>;
  assertEquals(
    [shown.note.id, shown.note.action, shown.note.text],
    [101, 'saved', 'Allergic to kiwi'],
  );
  const done = answer.at(-1) as Extract<ChatEvent, { event: 'done' }>;
  assertEquals(updated, [{ table: 'coach_notes', values: { message_id: done.messageId } }]);
});

Deno.test('still tells Bite of a card it spoke of, though it kept a note', async () => {
  const model = new FakeModel(
    [SAVE_NOTE],
    [{ type: 'text', text: "[[happy]] Here's a card for your lunch." }],
    [{ type: 'text', text: 'Sorry, I could not make it.' }],
  );
  const { ctx } = context(model, {}, { profiles: [{ ...PROFILE, coach_saves_notes: true }] });

  await events(await handleChatRequest(ask(MESSAGE), ctx));

  assertEquals(model.requests[2].messages.at(-1), {
    role: 'user',
    parts: [{ type: 'text', text: CARD_MISSING }],
  });
});

Deno.test('tells Bite that what it said with its lookups is shown already', async () => {
  const model = new FakeModel(
    [{ type: 'text', text: '[[happy]] Noted.' }, SAVE_NOTE],
    [{ type: 'text', text: 'Anything else?' }],
  );
  const { ctx } = context(model, {}, { profiles: [{ ...PROFILE, coach_saves_notes: true }] });

  await events(await handleChatRequest(ask(MESSAGE), ctx));

  assertEquals(model.requests[1].messages.at(-1)?.parts.at(-1), {
    type: 'text',
    text: SAID_ALREADY,
  });
});

Deno.test('removes a note asked about when its answer cannot be saved', async () => {
  const model = new FakeModel([SAVE_NOTE], [{ type: 'text', text: '[[happy]] Shall I keep it?' }]);
  const { ctx, deleted } = context(
    model,
    {},
    { profiles: [{ ...PROFILE, coach_saves_notes: false }] },
    { deletedThread: 100 },
  );

  const answer = await events(await handleChatRequest(ask(MESSAGE), ctx));

  assertEquals(answer.at(-1)?.event, 'error');
  assertEquals(deleted.includes('coach_notes 101'), true);
});

Deno.test('tells Bite of the notes it kept earlier, though it said nothing with them', async () => {
  const model = new FakeModel([{ type: 'text', text: '[[happy]] Sure.' }]);
  const note = { id: 9, action: 'asked', category: 'allergy', text: 'Allergic to kiwi' };
  const { ctx } = context(
    model,
    {},
    {
      coach_threads: [{ id: 7 }],
      coach_messages: [
        {
          role: 'bite',
          expression: 'neutral',
          content: [
            { type: 'toolCall', name: 'save_note', args: {} },
            { type: 'toolResult', name: 'save_note', result: { note } },
          ],
        },
      ],
    },
  );

  await events(await handleChatRequest(ask({ ...MESSAGE, threadId: 7 }), ctx));

  assertEquals(model.requests[0].messages[0], {
    role: 'model',
    parts: [
      {
        type: 'text',
        text: '[[neutral]] (Asked the user to save a note, #9, allergy: Allergic to kiwi)',
      },
    ],
  });
});

const TARGETS = { calories: 2100, proteinG: 150, carbsG: 210, fatG: 70 };

Deno.test('keeps a proposal made before a stop among its lookups, with its card', async () => {
  const stops: Row[] = [];
  const model = new FakeModel([
    { type: 'toolCall', id: 'c1', name: 'propose_targets_change', args: TARGETS },
    { type: 'toolCall', id: 'c2', name: 'search_foods', args: { query: 'oats' } },
  ]);
  // The app stops while the proposal is made, before the next lookup.
  const propose = () => {
    stops.push({ request_id: REQUEST });
    return 42;
  };
  const { ctx, inserted } = context(
    model,
    { propose_coach_change: propose },
    { coach_stops: stops },
  );

  const answer = await events(
    await handleChatRequest(ask({ ...MESSAGE, requestId: REQUEST }), ctx),
  );

  assertEquals(answer.at(-1)?.event, 'done');
  const content = inserted[1].rows[1].content as { type: string; result?: unknown }[];
  // The proposal's call and result, without the lookup that never ran.
  assertEquals(
    content.map((part) => part.type),
    ['toolCall', 'toolResult', 'text'],
  );
  assertEquals((content[1].result as { proposal: { id: number } }).proposal.id, 42);
  assertEquals(inserted[1].rows[1].interrupted, 'stopped');
});

Deno.test("keeps a proposal's card when a message is cut to what it may hold", () => {
  const big = { type: 'toolResult' as const, name: 'get_meal_log', result: 'x'.repeat(70_000) };
  const proposal = { kind: 'targets', id: 42, from: null, to: TARGETS };
  const card = {
    type: 'toolResult' as const,
    name: 'propose_targets_change',
    result: { proposal },
  };

  const kept = content([big, card], 'Here it is.');
  assertEquals(kept, [
    { ...big, result: { omitted: true } },
    card,
    { type: 'text', text: 'Here it is.' },
  ]);
  const many = content([...Array(60).fill(big), card], 'Here it is.');
  assertEquals(many.length, 50);
  assertEquals(many.includes(card), true);
});

Deno.test('leaves a card Bite speaks of alone when the thread has an earlier one', async () => {
  const model = new FakeModel([
    { type: 'text', text: '[[happy]] The card above is still waiting.' },
  ]);
  const proposal = { kind: 'targets', id: 42, from: null, to: TARGETS };
  const { ctx } = context(
    model,
    {},
    {
      coach_threads: [{ id: 7 }],
      coach_messages: [
        {
          role: 'bite',
          expression: 'neutral',
          content: [
            { type: 'toolCall', name: 'propose_targets_change', args: TARGETS },
            { type: 'toolResult', name: 'propose_targets_change', result: { proposal } },
          ],
        },
      ],
    },
  );

  await events(await handleChatRequest(ask({ ...MESSAGE, threadId: 7 }), ctx));

  assertEquals(model.requests.length, 1);
});

Deno.test('tells Bite what it proposed earlier, though it said nothing with it', async () => {
  const model = new FakeModel([{ type: 'text', text: '[[happy]] Sure.' }]);
  const proposal = { kind: 'targets', id: 42, from: null, to: TARGETS };
  const { ctx } = context(
    model,
    {},
    {
      coach_threads: [{ id: 7 }],
      coach_messages: [
        {
          role: 'bite',
          expression: 'neutral',
          content: [
            { type: 'toolCall', name: 'propose_targets_change', args: TARGETS },
            { type: 'toolResult', name: 'propose_targets_change', result: { proposal } },
            { type: 'text', text: '' },
          ],
        },
      ],
    },
  );

  await events(await handleChatRequest(ask({ ...MESSAGE, threadId: 7 }), ctx));

  assertEquals(model.requests[0].messages[0], {
    role: 'model',
    parts: [
      {
        type: 'text',
        text: '[[neutral]] (Proposed targets: 2100 kcal, 150 g protein, 210 g carbs, 70 g fat.)',
      },
    ],
  });
});

Deno.test('tells Bite which food log changes it proposed earlier', async () => {
  const model = new FakeModel([{ type: 'text', text: '[[happy]] Sure.' }]);
  const proposal = {
    kind: 'food_log',
    id: 43,
    changes: [
      {
        food: 'Pizza',
        from: { day: '2026-10-30', meal: 'lunch', grams: 300, kcal: 798 },
        to: { day: '2026-10-30', meal: 'dinner', grams: 300, kcal: 798 },
      },
      {
        food: 'Chocolate bar',
        from: { day: '2026-10-30', meal: 'snack', grams: 50, kcal: 268 },
      },
    ],
  };
  const { ctx } = context(
    model,
    {},
    {
      coach_threads: [{ id: 7 }],
      coach_messages: [
        {
          role: 'bite',
          expression: 'neutral',
          content: [
            {
              type: 'toolResult',
              name: 'propose_food_log_change',
              result: { proposal },
            },
            { type: 'text', text: '' },
          ],
        },
      ],
    },
  );

  await events(await handleChatRequest(ask({ ...MESSAGE, threadId: 7 }), ctx));

  assertEquals(model.requests[0].messages[0].parts[0], {
    type: 'text',
    text: '[[neutral]] (Proposed food log changes: Pizza 300 g, lunch on 2026-10-30 → 300 g, dinner on 2026-10-30; Chocolate bar 50 g, snack on 2026-10-30 → removed.)',
  });
});

const MEAL_CARD = {
  id: 51,
  day: '2026-10-30',
  meal: 'dinner',
  items: [
    {
      name: 'Chicken breast',
      searchName: 'Chicken breast, grilled',
      grams: 150,
      confidence: 0.8,
      per100: { kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6 },
      estimated: true,
    },
  ],
};

Deno.test(
  'shows a meal as a card, and keeps it though the model said nothing after it',
  async () => {
    // As the model gives an item, which the tool matches.
    const { estimated: _, ...item } = MEAL_CARD.items[0];
    const model = new FakeModel(
      [
        {
          type: 'toolCall',
          id: 'c1',
          name: 'log_meal_card',
          args: { meal: 'dinner', items: [item] },
        },
      ],
      [],
    );
    const { ctx, inserted } = context(model, { add_coach_meal_card: 51, search_foods: [] });

    const answer = await events(await handleChatRequest(ask(MESSAGE), ctx));

    assertEquals(
      answer.filter((e) => e.event === 'meal_card'),
      [{ event: 'meal_card', mealCard: MEAL_CARD }],
    );
    assertEquals(answer.at(-1), { event: 'done', threadId: 100, messageId: 102 });
    // The message keeps the card in its tool's result, to show it when the chat is read back.
    const content = inserted[1].rows[1].content as { type: string; result?: unknown }[];
    assertEquals(content.find((part) => part.type === 'toolResult')?.result, {
      mealCard: MEAL_CARD,
    });
  },
);

Deno.test('tells Bite of its meal cards earlier, with where they stand', async () => {
  const model = new FakeModel([{ type: 'text', text: '[[happy]] Sure.' }]);
  const stored = (card: typeof MEAL_CARD) => ({
    role: 'bite',
    expression: 'happy',
    content: [
      { type: 'toolResult', name: 'log_meal_card', result: { mealCard: card } },
      { type: 'text', text: 'Looks good.' },
    ],
  });
  const { ctx } = context(
    model,
    {},
    {
      coach_threads: [{ id: 7 }],
      coach_messages: [stored({ ...MEAL_CARD, id: 52 }), stored(MEAL_CARD)],
      coach_meal_cards: [{ id: 51, status: 'logged', kcal: 247.5 }],
    },
  );

  await events(await handleChatRequest(ask({ ...MESSAGE, threadId: 7 }), ctx));

  const card = '(Meal card for dinner on 2026-10-30: Chicken breast 150 g; 248 kcal.';
  assertEquals(
    model.requests[0].messages.slice(0, 2).map((message) => message.parts),
    [
      [{ type: 'text', text: `[[happy]] Looks good.\n${card} Added by the user, 248 kcal.)` }],
      // A card whose state could not be read is told without it.
      [{ type: 'text', text: `[[happy]] Looks good.\n${card})` }],
    ],
  );
});

const PHOTO = { mimeType: 'image/jpeg', data: toBase64(PLAIN_JPEG) };
const PHOTO_MESSAGE = { ...MESSAGE, message: 'Is this enough protein?', photos: [PHOTO, PHOTO] };
const SURE = [{ type: 'text' as const, text: '[[happy]] Sure.' }];

Deno.test('sends photos to the model in their turn, before the message', async () => {
  const model = new FakeModel(
    [{ type: 'toolCall', id: 'c1', name: 'get_records', args: {} }],
    [{ type: 'text', text: '[[happy]] About 40 g.' }],
  );
  const { ctx } = context(model);

  await (await handleChatRequest(ask(PHOTO_MESSAGE), ctx)).text();

  // In every request of the turn, with the snapshot and the tools.
  for (const request of model.requests) {
    const [snapshot, first, second, message] = request.messages[0].parts;
    assertEquals(snapshot.type === 'text' && snapshot.text.startsWith('<snapshot>'), true);
    assertEquals(
      [first, second],
      [
        { type: 'image', mimeType: 'image/jpeg', data: PHOTO.data },
        { type: 'image', mimeType: 'image/jpeg', data: PHOTO.data },
      ],
    );
    assertEquals(message, { type: 'text', text: '<message>\nIs this enough protein?\n</message>' });
  }
  assertEquals(model.requests[0].tools !== undefined, true);
});

Deno.test("keeps the photos in the thread's folder, and names them in the message", async () => {
  const { ctx, inserted, objects } = context(new FakeModel(SURE));

  const answer = await events(await handleChatRequest(ask(PHOTO_MESSAGE), ctx));

  assertEquals(answer.at(-1), { event: 'done', threadId: 100, messageId: 102 });
  const [question] = inserted[1].rows;
  const parts = question.content as Record<string, unknown>[];
  assertEquals(parts.length, 3);
  for (const part of parts.slice(0, 2)) {
    const { path, ...rest } = part as { path: string };
    assertEquals(rest, { type: 'image', mimeType: 'image/jpeg', width: 640, height: 480 });
    assertEquals(/^user-1\/100\/[0-9a-f-]{36}\.jpg$/.test(path), true, path);
    assertEquals(objects.get(path), PLAIN_JPEG);
  }
  assertEquals(parts[0].path !== parts[1].path, true);
  assertEquals(parts[2], { type: 'text', text: 'Is this enough protein?' });
});

Deno.test('takes photos without text, and reads them later as text', async () => {
  const first = context(new FakeModel(SURE));
  const photosOnly = { ...MESSAGE, message: '', photos: [PHOTO] };

  await (await handleChatRequest(ask(photosOnly), first.ctx)).text();

  const [question] = first.inserted[1].rows;
  assertEquals(
    (question.content as { type: string }[]).map((part) => part.type),
    ['image'],
  );
  // The message tags are there, empty, after the photo.
  const sent = first.ctx.model as FakeModel;
  assertEquals(sent.requests[0].messages[0].parts.at(-1), {
    type: 'text',
    text: '<message>\n\n</message>',
  });

  const model = new FakeModel(SURE);
  const later = context(
    model,
    {},
    {
      coach_threads: [{ id: 7 }],
      coach_messages: [
        { role: 'bite', expression: 'happy', content: [{ type: 'text', text: 'Looks good.' }] },
        {
          role: 'user',
          content: [
            { type: 'image', path: 'p/2.jpg' },
            { type: 'text', text: 'And now?' },
          ],
        },
        { role: 'user', content: question.content },
      ],
    },
  );
  await (await handleChatRequest(ask({ ...MESSAGE, threadId: 7 }), later.ctx)).text();

  // Oldest first; no photo goes to the model again.
  assertEquals(model.requests[0].messages.slice(0, 3), [
    { role: 'user', parts: [{ type: 'text', text: '(Sent a photo.)' }] },
    { role: 'user', parts: [{ type: 'text', text: '(Sent a photo.)\nAnd now?' }] },
    { role: 'model', parts: [{ type: 'text', text: '[[happy]] Looks good.' }] },
  ]);
  assertEquals(
    model.requests[0].messages
      .flatMap((message) => message.parts)
      .some((part) => part.type === 'image'),
    false,
  );
});

Deno.test('refuses photos it does not take, before anything is asked or kept', async () => {
  const model = new FakeModel();
  const { ctx, inserted, objects } = context(model);
  const photo = (bytes: Uint8Array) => ({ mimeType: 'image/jpeg', data: toBase64(bytes) });
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const withExif = jpeg(SOI, EXIF, JFIF, FRAME, SCAN, EOI);
  const large = { mimeType: 'image/jpeg', data: btoa('x'.repeat(1_100_000)) };

  const cases: [unknown, number, Record<string, unknown>][] = [
    [{ photos: [PHOTO, photo(png)] }, 415, { error: 'photo_not_jpeg', photo: 1 }],
    [{ photos: [photo(withExif)] }, 422, { error: 'photo_has_exif', photo: 0 }],
    [{ photos: [large, large, large] }, 413, { error: 'photos_too_large' }],
  ];
  for (const [body, status, error] of cases) {
    const response = await handleChatRequest(ask({ ...MESSAGE, ...(body as object) }), ctx);
    assertEquals([response.status, await response.json()], [status, error]);
  }
  for (const body of [
    { photos: [PHOTO, PHOTO, PHOTO, PHOTO] },
    { photos: [{ ...PHOTO, mimeType: 'image/png' }] },
    { photos: [{ ...PHOTO, data: 'not base64!' }] },
    { message: '  ', photos: [] },
    { message: undefined },
    { localTime: '25:00' },
  ]) {
    const response = await handleChatRequest(ask({ ...MESSAGE, ...body }), ctx);
    assertEquals(response.status, 400, JSON.stringify(body));
  }
  // A body larger than any the app sends is not read as JSON at all.
  const huge = ask(`{"photos": "${'x'.repeat(5_000_000)}"}`);
  assertEquals((await handleChatRequest(huge, ctx)).status, 413);
  assertEquals([model.requests, inserted, objects.size], [[], [], 0]);
});

Deno.test('keeps no photo of a message that is dropped', async () => {
  // Refused before the model was asked.
  const refused = context(new FakeModel(), {
    start_ai_call: {
      allowed: false,
      reason: 'limit_reached',
      call_id: null,
      max_output_tokens: null,
    },
  });
  const answer = await events(await handleChatRequest(ask(PHOTO_MESSAGE), refused.ctx));
  assertEquals(answer.at(-1), { event: 'error', reason: 'limit_reached', dropped: true });
  assertEquals(refused.objects.size, 0);

  // Blocked by the model.
  const blocked = context(new FakeModel({ parts: [], usage: FAKE_USAGE, finish: 'blocked' }));
  await (await handleChatRequest(ask(PHOTO_MESSAGE), blocked.ctx)).text();
  assertEquals([blocked.objects.size, blocked.inserted.length], [0, 1]);
});

Deno.test('keeps the photos of a question Bite gave no answer to', async () => {
  const { ctx, inserted, objects } = context(new FakeModel([]));

  const answer = await events(await handleChatRequest(ask(PHOTO_MESSAGE), ctx));

  assertEquals(answer.at(-1), { event: 'error', reason: 'unavailable' });
  assertEquals(objects.size, 2);
  const parts = inserted[1].rows[0].content as { type: string; path?: string }[];
  assertEquals(
    parts.map((part) => part.type),
    ['image', 'image', 'text'],
  );
  assertEquals(
    parts.slice(0, 2).every((part) => objects.has(part.path!)),
    true,
  );
});

Deno.test('removes the photos again when the message cannot be saved', async () => {
  // The thread was deleted while Bite answered: its folder was queued for removal then.
  const { ctx, objects, removed } = context(
    new FakeModel(SURE),
    {},
    { coach_threads: [{ id: 7 }] },
    { deletedThread: 7 },
  );

  const answer = await events(await handleChatRequest(ask({ ...PHOTO_MESSAGE, threadId: 7 }), ctx));

  assertEquals(answer.at(-1), { event: 'error', reason: 'not_saved' });
  assertEquals([objects.size, removed.length], [0, 2]);
});

Deno.test('saves no message when a photo cannot be kept, and drops the new thread', async () => {
  const { ctx, inserted, objects, removed, threads } = context(
    new FakeModel(SURE),
    {},
    {},
    {
      failingUploads: [1],
    },
  );

  const answer = await events(await handleChatRequest(ask(PHOTO_MESSAGE), ctx));

  assertEquals(answer.at(-1), { event: 'error', reason: 'not_saved', dropped: true });
  assertEquals([objects.size, removed.length], [0, 1]);
  assertEquals(
    inserted.map(({ table }) => table),
    ['coach_threads'],
  );
  assertEquals(threads.size, 0);

  // A question Bite gave no answer to, whose photo cannot be kept either.
  const unanswered = context(new FakeModel([]), {}, {}, { failingUploads: [0] });
  const ended = await events(await handleChatRequest(ask(PHOTO_MESSAGE), unanswered.ctx));
  assertEquals(ended.at(-1), { event: 'error', reason: 'unavailable', dropped: true });
  assertEquals(unanswered.threads.size, 0);
});

Deno.test("tells Bite the device's local time", async () => {
  const model = new FakeModel(SURE);
  const { ctx } = context(model);

  await (await handleChatRequest(ask({ ...MESSAGE, localTime: '07:45' }), ctx)).text();

  const [snapshot] = model.requests[0].messages[0].parts as { text: string }[];
  assertEquals(snapshot.text.includes('Local time: 07:45'), true);
});

Deno.test("takes a card's meal from the device's local time when the user named none", async () => {
  const { estimated: _, ...item } = MEAL_CARD.items[0];
  const model = new FakeModel(
    [{ type: 'toolCall', id: 'c1', name: 'log_meal_card', args: { items: [item] } }],
    [],
  );
  const { ctx } = context(model, { add_coach_meal_card: 51, search_foods: [] });

  const answer = await events(
    await handleChatRequest(ask({ ...MESSAGE, localTime: '12:40' }), ctx),
  );

  assertEquals(
    answer.filter((e) => e.event === 'meal_card'),
    [{ event: 'meal_card', mealCard: { ...MEAL_CARD, meal: 'lunch' } }],
  );
});

Deno.test('logs a meal from photos as a card, and reads both back later', async () => {
  const { estimated: _, ...item } = MEAL_CARD.items[0];
  const model = new FakeModel(
    [
      {
        type: 'toolCall',
        id: 'c1',
        name: 'log_meal_card',
        args: { meal: 'dinner', items: [item] },
      },
    ],
    [{ type: 'text', text: '[[happy]] Looks good.' }],
  );
  const first = context(model, { add_coach_meal_card: 51, search_foods: [] });

  const answer = await events(await handleChatRequest(ask(PHOTO_MESSAGE), first.ctx));

  // The photos go to the model in the turn whose card it gives.
  const parts = model.requests[0].messages[0].parts;
  assertEquals(parts.filter((part) => part.type === 'image').length, 2);
  assertEquals(
    answer.filter((e) => e.event === 'meal_card'),
    [{ event: 'meal_card', mealCard: MEAL_CARD }],
  );
  assertEquals(answer.at(-1), { event: 'done', threadId: 100, messageId: 102 });
  const [question, reply] = first.inserted[1].rows;
  assertEquals(
    (question.content as { type: string }[]).map((part) => part.type),
    ['image', 'image', 'text'],
  );
  assertEquals(first.objects.size, 2);

  const later = new FakeModel(SURE);
  const { ctx } = context(
    later,
    {},
    {
      coach_threads: [{ id: 7 }],
      // Newest first, as read.
      coach_messages: [
        { role: 'bite', expression: 'happy', content: reply.content },
        { role: 'user', content: question.content },
      ],
      coach_meal_cards: [{ id: 51, status: 'logged', kcal: 247.5 }],
    },
  );
  await (await handleChatRequest(ask({ ...MESSAGE, threadId: 7 }), ctx)).text();

  assertEquals(later.requests[0].messages.slice(0, 2), [
    {
      role: 'user',
      parts: [{ type: 'text', text: '(Sent 2 photos.)\nIs this enough protein?' }],
    },
    {
      role: 'model',
      parts: [
        {
          type: 'text',
          text:
            '[[happy]] Looks good.\n(Meal card for dinner on 2026-10-30: Chicken breast 150 g; ' +
            '248 kcal. Added by the user, 248 kcal.)',
        },
      ],
    },
  ]);
});
