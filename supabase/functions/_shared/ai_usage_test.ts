import { assertEquals, assertRejects } from '@std/assert';

import { type AiAccess, type AiCallContext, withAiCall } from './ai_usage.ts';
import { FAKE_USAGE, FakeModel } from './llm/fake.ts';
import { ModelError, type StreamEvent } from './llm/mod.ts';

const ACCESS: AiAccess = {
  allowed: true,
  reason: null,
  budget_usd: 4,
  used_usd: 1.2,
  resets_at: '2026-11-01T00:00:00+00:00',
  call_id: 'call-1',
  max_output_tokens: 2048,
};

const HI = { role: 'user' as const, parts: [{ type: 'text' as const, text: 'Hi' }] };

/**
 * The context of a call: the database answering with `access`, recording with the errors given
 * in turn, and `model`; with the calls each client was asked.
 */
function context(
  model: FakeModel,
  access: AiAccess = ACCESS,
  recordErrors: ({ message: string } | null)[] = [],
) {
  const calls: { client: string; name: string; args: unknown }[] = [];
  const client = (name: string) =>
    ({
      rpc: (fn: string, args: unknown) => {
        calls.push({ client: name, name: fn, args });
        if (fn === 'start_ai_call') return Promise.resolve({ data: access, error: null });
        return Promise.resolve({ data: 0.0004, error: recordErrors.shift() ?? null });
      },
    }) as unknown as AiCallContext['supabase'];
  const ctx: AiCallContext = {
    supabase: client('user'),
    admin: client('admin'),
    env: { get: () => undefined },
    model,
  };
  return { ctx, calls };
}

const START = {
  client: 'user',
  name: 'start_ai_call',
  args: { feature: 'coach_chat', model: 'gemini-3.5-flash-lite' },
};

function recorded(tokens: [number, number, number, number], known = true) {
  const [input, cached, output, thinking] = tokens;
  return {
    client: 'admin',
    name: 'record_ai_usage',
    args: {
      call_id: 'call-1',
      input_tokens: input,
      cached_input_tokens: cached,
      output_tokens: output,
      thinking_tokens: thinking,
      known,
    },
  };
}

const FAKE_TOKENS: [number, number, number, number] = [
  FAKE_USAGE.inputTokens,
  FAKE_USAGE.cachedInputTokens,
  FAKE_USAGE.outputTokens,
  FAKE_USAGE.thinkingTokens,
];

Deno.test("starts the call on the task's model, runs it and records what it used", async () => {
  const model = new FakeModel([{ type: 'text', text: 'Hello!' }]);
  const { ctx, calls } = context(model);

  const done = await withAiCall(ctx, 'coach_chat', async (bite) => {
    const answer = await bite.generate({ messages: [HI] });
    return answer.parts;
  });

  assertEquals(done, { access: ACCESS, result: [{ type: 'text', text: 'Hello!' }] });
  assertEquals(calls, [START, recorded(FAKE_TOKENS)]);
});

Deno.test('fills in the task, and cuts the answer where the limit says', async () => {
  const model = new FakeModel([], []);
  const { ctx } = context(model);

  await withAiCall(ctx, 'coach_chat', async (bite) => {
    await bite.generate({ messages: [HI] });
    await bite.generate({ messages: [HI], maxOutputTokens: 100_000 });
  });

  assertEquals(
    model.requests.map(({ task, maxOutputTokens }) => ({ task, maxOutputTokens })),
    [
      { task: 'coach_chat', maxOutputTokens: 2048 },
      { task: 'coach_chat', maxOutputTokens: 2048 },
    ],
  );
});

Deno.test("starts the call on the environment's model where it names one", async () => {
  const { ctx, calls } = context(new FakeModel());

  await withAiCall({ ...ctx, env: { get: () => 'gemini-3.8-flash' } }, 'coach_chat', () =>
    Promise.resolve(),
  );

  assertEquals(calls[0].args, { feature: 'coach_chat', model: 'gemini-3.8-flash' });
});

Deno.test('runs nothing when the user may not make the call', async () => {
  const refused: AiAccess = {
    ...ACCESS,
    allowed: false,
    reason: 'plan_required',
    call_id: null,
    max_output_tokens: null,
  };
  const { ctx, calls } = context(new FakeModel(), refused);
  let ran = false;

  const done = await withAiCall(ctx, 'coach_chat', () => {
    ran = true;
    return Promise.resolve();
  });

  assertEquals([done, ran], [{ access: refused }, false]);
  assertEquals(calls, [START]);
});

Deno.test("records what the model used when the call's own code then fails", async () => {
  const { ctx, calls } = context(new FakeModel([{ type: 'text', text: 'Hello!' }]));

  await assertRejects(
    () =>
      withAiCall(ctx, 'coach_chat', async (bite) => {
        await bite.generate({ messages: [HI] });
        throw new Error('The app closed the stream');
      }),
    Error,
    'closed the stream',
  );
  assertEquals(calls, [START, recorded(FAKE_TOKENS)]);
});

Deno.test('records what a stream used when the call stops reading it', async () => {
  const { ctx, calls } = context(
    new FakeModel([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo!' },
    ]),
  );

  await withAiCall(ctx, 'coach_chat', async (bite) => {
    const events: StreamEvent[] = [];
    for await (const event of bite.stream({ messages: [HI] })) {
      events.push(event);
      break;
    }
    return events;
  });

  assertEquals(calls, [START, recorded(FAKE_TOKENS)]);
});

Deno.test('counts a model call that never said what it used at its most', async () => {
  const failing = {
    generate: () => Promise.reject(new ModelError('Gemini: the answer broke off', 503, true)),
    stream: () => {
      throw new Error('unused');
    },
  };
  const { ctx, calls } = context(new FakeModel());

  await assertRejects(
    () =>
      withAiCall({ ...ctx, model: failing }, 'coach_chat', (bite) =>
        bite.generate({ messages: [HI] }),
      ),
    ModelError,
  );
  assertEquals(calls, [START, recorded([0, 0, 0, 0], false)]);
});

Deno.test('records nothing used when the call fails before the model', async () => {
  const { ctx, calls } = context(new FakeModel());

  await assertRejects(
    () => withAiCall(ctx, 'coach_chat', () => Promise.reject(new Error('Bad input'))),
    Error,
    'Bad input',
  );
  assertEquals(calls, [START, recorded([0, 0, 0, 0])]);
});

Deno.test('tries recording once more, and logs it when that fails too', async () => {
  const once = context(new FakeModel([]), ACCESS, [{ message: 'Connection reset' }]);
  await withAiCall(once.ctx, 'coach_chat', (bite) => bite.generate({ messages: [HI] }));
  assertEquals(once.calls.length, 3);

  const logged: unknown[] = [];
  const error = console.error;
  console.error = (...args: unknown[]) => logged.push(...args);
  try {
    const twice = context(new FakeModel([]), ACCESS, [
      { message: 'Connection reset' },
      { message: 'Connection reset' },
    ]);
    const done = await withAiCall(twice.ctx, 'coach_chat', () => Promise.resolve('Hello!'));

    assertEquals(done.result, 'Hello!');
    assertEquals(logged, ['record_ai_usage: Connection reset']);
  } finally {
    console.error = error;
  }
});
