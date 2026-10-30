import { assertEquals } from '@std/assert';

import { FAKE_USAGE, FakeModel } from '../_shared/llm/fake.ts';
import type { ChatContext, ChatEvent } from './handler.ts';
import { content, handleChatRequest } from './handler.ts';

type Row = Record<string, unknown>;

/**
 * A database for the chat: tables with their rows, functions with what they return, and what is
 * inserted, which the service role writes. Every query resolves with all of a table's rows.
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
      delete: () => ({
        eq: (_column: string, id: unknown) => {
          deleted.push(`${table} ${id}`);
          return Promise.resolve({ error: null });
        },
      }),
    }),
    rpc: (name: string) =>
      Promise.resolve({
        data: name in rpc ? rpc[name] : name === 'ai_access' ? { allowed: true } : [],
        error: null,
      }),
  } as unknown as ChatContext['supabase'];
  return { client, inserted, deleted };
}

const STARTED = { allowed: true, reason: null, call_id: 'call-1', max_output_tokens: 2048 };

function context(model: FakeModel, rpc: Record<string, unknown> = {}, tables = {}) {
  const db = database({ start_ai_call: STARTED, record_ai_usage: 0.001, ...rpc }, tables);
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
  assertEquals(message, { type: 'text', text: 'Did I eat enough protein?' });
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
    { event: 'thread', threadId: 100 },
    { event: 'error', reason: 'limit_reached' },
  ]);
  // The thread started for it goes again, and the question is not asked.
  assertEquals(
    inserted.map(({ table }) => table),
    ['coach_threads'],
  );
  assertEquals(deleted, ['coach_threads 100']);
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

Deno.test('says why when an answer comes without text, and keeps the question', async () => {
  const blocked = context(new FakeModel({ parts: [], usage: FAKE_USAGE, finish: 'blocked' }));
  assertEquals(await events(await handleChatRequest(ask(MESSAGE), blocked.ctx)), [
    { event: 'thread', threadId: 100 },
    { event: 'error', reason: 'blocked' },
  ]);
  const faceOnly = context(new FakeModel([{ type: 'text', text: '[[sad]]' }]));
  assertEquals((await events(await handleChatRequest(ask(MESSAGE), faceOnly.ctx))).at(-1), {
    event: 'error',
    reason: 'unavailable',
  });
  // The question stays in its thread without an answer, as the app shows it.
  for (const { inserted, deleted } of [blocked, faceOnly]) {
    assertEquals(
      inserted.map(({ table }) => table),
      ['coach_threads', 'coach_messages'],
    );
    assertEquals(
      inserted[1].rows.map(({ role }) => role),
      ['user'],
    );
    assertEquals(deleted, []);
  }
});

Deno.test('keeps what was said when the budget runs out after a lookup', async () => {
  const model = new FakeModel([
    { type: 'text', text: '[[neutral]] Let me check.' },
    { type: 'toolCall', name: 'get_records', args: {} },
  ]);
  const { ctx, inserted } = context(model);
  // The budget is enough for the first request, not the second.
  const client = ctx.supabase as unknown as { rpc: (name: string, args?: unknown) => unknown };
  const rpc = client.rpc;
  let asked = 0;
  client.rpc = (name, args) =>
    name === 'ai_access' && asked++ > 0
      ? Promise.resolve({ data: { allowed: false, reason: 'limit_reached' }, error: null })
      : rpc(name, args);

  const answer = await events(await handleChatRequest(ask(MESSAGE), ctx));

  assertEquals(answer.at(-1), { event: 'done', threadId: 100, messageId: 102, interrupted: true });
  assertEquals(inserted.length, 2);
});

Deno.test('says an answer cut at the token limit stopped short', async () => {
  const cut = {
    parts: [{ type: 'text' as const, text: '[[happy]] Your week was' }],
    usage: FAKE_USAGE,
    finish: 'length' as const,
  };
  const { ctx } = context(new FakeModel(cut));

  const answer = await events(await handleChatRequest(ask(MESSAGE), ctx));

  assertEquals(answer.at(-1), { event: 'done', threadId: 100, messageId: 102, interrupted: true });
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
