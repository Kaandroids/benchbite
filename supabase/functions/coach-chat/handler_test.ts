import { assertEquals } from '@std/assert';

import { FAKE_USAGE, FakeModel } from '../_shared/llm/fake.ts';
import { ModelError, type ModelRequest, type StreamEvent } from '../_shared/llm/mod.ts';
import type { ChatContext, ChatEvent } from './handler.ts';
import { content, ending, handleChatRequest } from './handler.ts';

type Row = Record<string, unknown>;

/**
 * A database for the chat: tables with their rows, functions with what they return, or a
 * function giving it, and what is inserted and deleted, which the service role writes. Every
 * query resolves with all of a table's rows.
 */
function database(rpc: Record<string, unknown> = {}, tables: Record<string, Row[]> = {}) {
  const inserted: { table: string; rows: Row[] }[] = [];
  const deleted: string[] = [];
  let nextId = 100;
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
    for (const method of ['select', 'eq', 'in', 'ilike', 'order', 'limit']) {
      builder[method] = () => builder;
    }
    return builder;
  };
  const client = {
    from: (table: string) => ({
      ...query(table),
      insert: (rows: Row | Row[]) => {
        const list = (Array.isArray(rows) ? rows : [rows]).map((row) => ({ ...row, id: nextId++ }));
        inserted.push({ table, rows: list });
        return query(table, list);
      },
      delete: () => {
        const values: unknown[] = [];
        const filter = {
          eq: (_column: string, value: unknown) => {
            values.push(value);
            return filter;
          },
          then: (resolve: (value: unknown) => void) => {
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
  } as unknown as ChatContext['supabase'];
  return { client, inserted, deleted };
}

const STARTED = { allowed: true, reason: null, call_id: 'call-1', max_output_tokens: 2048 };

function context(model: FakeModel, rpc: Record<string, unknown> = {}, tables = {}) {
  const db = database(
    { start_ai_call: STARTED, count_ai_call: STARTED, record_ai_usage: 0.001, ...rpc },
    tables,
  );
  const ctx: ChatContext = { supabase: db.client, admin: db.client, userId: 'user-1', model };
  return { ctx, inserted: db.inserted, deleted: db.deleted };
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

Deno.test('keeps a message within what a message may hold', () => {
  const call = { type: 'toolCall' as const, name: 'get_meal_log', args: { day: '2026-10-01' } };
  const big = { type: 'toolResult' as const, name: 'get_meal_log', result: 'x'.repeat(70_000) };
  const small = { type: 'toolResult' as const, name: 'get_meal_log', result: [] };

  assertEquals(content([call, small], 'Hi').length, 3);
  assertEquals(content([call, big], 'Hi')[1], { ...big, result: { omitted: true } });
  assertEquals(content(Array(60).fill(call), 'Hi').length, 50);
});

Deno.test('keeps what came of a message, and says why it ended', () => {
  const answer = { said: false, stopped: false, finish: 'stop' as const, newThread: true };
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
  // Without text: the question once the model was asked, else nothing, and a new thread goes.
  assertEquals(ending(asked, { ...answer, finish: 'stop' }), {
    keep: 'question',
    reason: 'unavailable',
    dropThread: false,
  });
  assertEquals(ending(asked, { ...answer, finish: 'blocked' }), {
    keep: 'nothing',
    reason: 'blocked',
    dropThread: true,
  });
  assertEquals(ending(notAsked, answer), {
    keep: 'nothing',
    reason: 'unavailable',
    dropThread: true,
  });
  assertEquals(ending(refused, { ...answer, newThread: false }), {
    keep: 'nothing',
    reason: 'limit_reached',
    dropThread: false,
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
