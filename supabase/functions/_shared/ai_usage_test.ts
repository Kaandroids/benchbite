import { assertEquals, assertRejects } from '@std/assert';

import { type AiContext, aiModel, AiRefusedError } from './ai_usage.ts';
import { FAKE_USAGE, FakeModel } from './llm/fake.ts';
import type { Database } from './database.types.ts';
import { type LanguageModel, ModelError } from './llm/mod.ts';

type AiCall = Database['public']['CompositeTypes']['ai_call'];

const STARTED: AiCall = { allowed: true, reason: null, call_id: 'call-1', max_output_tokens: 2048 };

const HI = { role: 'user' as const, parts: [{ type: 'text' as const, text: 'Hi' }] };

/**
 * The context of a model: the database allowing the user or not, starting calls with `starts` in
 * turn and recording with the errors given in turn, and `model`; with the calls each client was
 * asked, apart from asking for access.
 */
function context(
  model: LanguageModel,
  starts: AiCall[] = [STARTED],
  recordErrors: ({ message: string } | null)[] = [],
  access: Partial<AiCall> = { allowed: true, reason: null },
) {
  const calls: { client: string; name: string; args: unknown }[] = [];
  const client = (name: string) =>
    ({
      rpc: (fn: string, args: unknown) => {
        if (fn === 'ai_access') return Promise.resolve({ data: access, error: null });
        calls.push({ client: name, name: fn, args });
        if (fn === 'start_ai_call') return Promise.resolve({ data: starts.shift(), error: null });
        return Promise.resolve({ data: 0.0004, error: recordErrors.shift() ?? null });
      },
    }) as unknown as AiContext['supabase'];
  const ctx: AiContext = { supabase: client('user'), admin: client('admin'), model };
  return { ctx, calls };
}

const START = {
  client: 'user',
  name: 'start_ai_call',
  args: { feature: 'coach_chat', model: 'fake', input_tokens: FAKE_USAGE.inputTokens },
};

function recorded(tokens: [number, number, number, number] | 'unknown', callId = 'call-1') {
  const [input, cached, output, thinking] = tokens === 'unknown' ? [0, 0, 0, 0] : tokens;
  return {
    client: 'admin',
    name: 'record_ai_usage',
    args: {
      call_id: callId,
      input_tokens: input,
      cached_input_tokens: cached,
      output_tokens: output,
      thinking_tokens: thinking,
      known: tokens !== 'unknown',
    },
  };
}

const USED: [number, number, number, number] = [
  FAKE_USAGE.inputTokens,
  FAKE_USAGE.cachedInputTokens,
  FAKE_USAGE.outputTokens,
  FAKE_USAGE.thinkingTokens,
];

Deno.test('counts what a request sends, starts its call, and records what it used', async () => {
  const model = new FakeModel([{ type: 'text', text: 'Hello!' }]);
  const { ctx, calls } = context(model);

  const answer = await aiModel(ctx, 'coach_chat').generate({ messages: [HI] });

  assertEquals(answer.parts, [{ type: 'text', text: 'Hello!' }]);
  assertEquals(calls, [START, recorded(USED)]);
});

Deno.test('starts and records each request of its own, as a chat with tools makes', async () => {
  const model = new FakeModel(
    [{ type: 'toolCall', name: 'getPlan', args: {} }],
    [{ type: 'text', text: 'Push day.' }],
  );
  const { ctx, calls } = context(model, [STARTED, { ...STARTED, call_id: 'call-2' }]);
  const bite = aiModel(ctx, 'coach_chat');

  await bite.generate({ messages: [HI] });
  await bite.generate({ messages: [HI] });

  assertEquals(calls, [START, recorded(USED), START, recorded(USED, 'call-2')]);
});

Deno.test('fills in the task, and cuts the answer where the limit says', async () => {
  const model = new FakeModel([], [], []);
  const { ctx } = context(model, [STARTED, STARTED, STARTED]);
  const bite = aiModel(ctx, 'coach_chat');

  await bite.generate({ messages: [HI] });
  await bite.generate({ messages: [HI], maxOutputTokens: 100_000 });
  await bite.generate({ messages: [HI], maxOutputTokens: 0 });

  assertEquals(
    model.requests.map(({ task, maxOutputTokens }) => ({ task, maxOutputTokens })),
    [
      { task: 'coach_chat', maxOutputTokens: 2048 },
      { task: 'coach_chat', maxOutputTokens: 2048 },
      { task: 'coach_chat', maxOutputTokens: 2048 },
    ],
  );
});

Deno.test('refuses a request the user may not make, and calls no model', async () => {
  const model = new FakeModel([]);
  const { ctx, calls } = context(model, [
    { allowed: false, reason: 'request_too_large', call_id: null, max_output_tokens: null },
  ]);

  const error = await assertRejects(
    () => aiModel(ctx, 'coach_chat').generate({ messages: [HI] }),
    AiRefusedError,
  );

  assertEquals([error.reason, model.requests.length], ['request_too_large', 0]);
  assertEquals(calls, [START]);
});

Deno.test('asks for access before it counts anything with the provider', async () => {
  const model = new FakeModel([]);
  let counted = false;
  model.countTokens = () => {
    counted = true;
    return Promise.resolve(10);
  };
  const { ctx, calls } = context(model, [], [], { allowed: false, reason: 'plan_required' });

  const error = await assertRejects(
    () => aiModel(ctx, 'coach_chat').generate({ messages: [HI] }),
    AiRefusedError,
  );

  assertEquals([error.reason, counted, calls], ['plan_required', false, []]);
});

Deno.test('sends what it counted, whatever the caller changes meanwhile', async () => {
  const model = new FakeModel([]);
  const messages = [HI];
  const count = model.countTokens.bind(model);
  model.countTokens = (request) => {
    messages.push(HI);
    return count(request);
  };
  const { ctx } = context(model);

  await aiModel(ctx, 'coach_chat').generate({ messages });

  assertEquals(model.requests[0].messages.length, 1);
});

Deno.test('records a stream read to its end at what it used', async () => {
  const { ctx, calls } = context(new FakeModel([{ type: 'text', text: 'Hello!' }]));

  for await (const _ of aiModel(ctx, 'coach_chat').stream({ messages: [HI] }));

  assertEquals(calls, [START, recorded(USED)]);
});

Deno.test('counts a stream left before its end at its most', async () => {
  const { ctx, calls } = context(
    new FakeModel([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo!' },
    ]),
  );

  for await (const _ of aiModel(ctx, 'coach_chat').stream({ messages: [HI] })) break;

  assertEquals(calls, [START, recorded('unknown')]);
});

Deno.test('counts a request that broke off at its most, and one refused at nothing', async () => {
  const failing = (billed: boolean): LanguageModel => ({
    model: () => 'fake',
    countTokens: () => Promise.resolve(FAKE_USAGE.inputTokens),
    generate: () =>
      Promise.reject(new ModelError('Gemini: failed', { status: 503, retryable: true, billed })),
    stream: () => {
      throw new Error('unused');
    },
  });

  const broke = context(failing(true));
  await assertRejects(() => aiModel(broke.ctx, 'coach_chat').generate({ messages: [HI] }));
  const refused = context(failing(false));
  await assertRejects(() => aiModel(refused.ctx, 'coach_chat').generate({ messages: [HI] }));

  assertEquals(broke.calls[1], recorded('unknown'));
  assertEquals(refused.calls[1], recorded([0, 0, 0, 0]));
});

Deno.test('tries recording once more, and logs it when that fails too', async () => {
  const once = context(new FakeModel([]), [STARTED], [{ message: 'Connection reset' }]);
  await aiModel(once.ctx, 'coach_chat').generate({ messages: [HI] });
  assertEquals(once.calls.length, 3);

  const logged: unknown[] = [];
  const error = console.error;
  console.error = (...args: unknown[]) => logged.push(...args);
  try {
    const twice = context(
      new FakeModel([]),
      [STARTED],
      [{ message: 'Connection reset' }, { message: 'Connection reset' }],
    );
    const answer = await aiModel(twice.ctx, 'coach_chat').generate({ messages: [HI] });

    assertEquals(answer.parts, []);
    assertEquals(logged, ['record_ai_usage: Connection reset']);
  } finally {
    console.error = error;
  }
});
