import { assertEquals, assertRejects } from '@std/assert';

import { type AiAccess, type AiCallContext, withAiCall } from './ai_usage.ts';
import { ModelError, type Usage } from './llm/mod.ts';

const ACCESS: AiAccess = {
  allowed: true,
  reason: null,
  budget_usd: 4,
  used_usd: 1.2,
  resets_at: '2026-11-01T00:00:00+00:00',
  call_id: 'call-1',
};

const USAGE: Usage = {
  model: 'gemini-3.5-flash-lite',
  inputTokens: 1000,
  cachedInputTokens: 400,
  outputTokens: 100,
  thinkingTokens: 20,
};

const NOTHING_USED = {
  ...USAGE,
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
};

/** The two clients of a call, the first answering with `access`, and the calls each was asked. */
function clients(access: AiAccess, recordError: { message: string } | null = null) {
  const calls: { client: string; name: string; args: unknown }[] = [];
  const client = (name: string) =>
    ({
      rpc: (fn: string, args: unknown) => {
        calls.push({ client: name, name: fn, args });
        return Promise.resolve(
          fn === 'start_ai_call'
            ? { data: access, error: null }
            : { data: recordError ? null : 0.0004, error: recordError },
        );
      },
    }) as unknown as AiCallContext['supabase'];
  const context: AiCallContext = {
    supabase: client('user'),
    admin: client('admin'),
    userId: 'user-1',
    env: { get: () => undefined },
  };
  return { context, calls };
}

function recorded(usage: Usage) {
  return {
    client: 'admin',
    name: 'record_ai_usage',
    args: {
      user_id: 'user-1',
      feature: 'coach_chat',
      call_id: 'call-1',
      model: usage.model,
      input_tokens: usage.inputTokens,
      cached_input_tokens: usage.cachedInputTokens,
      output_tokens: usage.outputTokens,
      thinking_tokens: usage.thinkingTokens,
    },
  };
}

const START = {
  client: 'user',
  name: 'start_ai_call',
  args: { feature: 'coach_chat', model: 'gemini-3.5-flash-lite' },
};

Deno.test("starts the call on the task's model, runs it and records its usage", async () => {
  const { context, calls } = clients(ACCESS);

  const done = await withAiCall(context, 'coach_chat', () =>
    Promise.resolve({ result: 'Hello!', usage: USAGE }),
  );

  assertEquals(done, { access: ACCESS, result: 'Hello!' });
  assertEquals(calls, [START, recorded(USAGE)]);
});

Deno.test("starts the call on the environment's model where it names one", async () => {
  const { context, calls } = clients(ACCESS);

  await withAiCall({ ...context, env: { get: () => 'gemini-3.8-flash' } }, 'coach_chat', () =>
    Promise.resolve({ result: null, usage: USAGE }),
  );

  assertEquals(calls[0].args, { feature: 'coach_chat', model: 'gemini-3.8-flash' });
});

Deno.test('runs nothing when the user may not make the call', async () => {
  const refused = { ...ACCESS, allowed: false, reason: 'plan_required' as const, call_id: null };
  const { context, calls } = clients(refused);
  let ran = false;

  const done = await withAiCall(context, 'coach_chat', () => {
    ran = true;
    return Promise.resolve({ result: 'Hello!', usage: USAGE });
  });

  assertEquals([done, ran], [{ access: refused }, false]);
  assertEquals(calls, [START]);
});

Deno.test('records what a failed call used, and throws its error on', async () => {
  const { context, calls } = clients(ACCESS);
  const partial = { ...USAGE, outputTokens: 8, thinkingTokens: 0 };

  await assertRejects(
    () =>
      withAiCall(context, 'coach_chat', () =>
        Promise.reject(new ModelError('Gemini: 503 Overloaded', 503, true, partial)),
      ),
    ModelError,
    'Overloaded',
  );
  assertEquals(calls, [START, recorded(partial)]);
});

Deno.test('records nothing used when a call fails before the model', async () => {
  const { context, calls } = clients(ACCESS);

  await assertRejects(
    () => withAiCall(context, 'coach_chat', () => Promise.reject(new Error('Bad input'))),
    Error,
    'Bad input',
  );
  assertEquals(calls, [START, recorded(NOTHING_USED)]);
});

Deno.test('gives the result when recording fails, and logs it', async () => {
  const { context } = clients(ACCESS, { message: 'No price is known' });
  const logged: unknown[] = [];
  const error = console.error;
  console.error = (...args: unknown[]) => logged.push(...args);
  try {
    const done = await withAiCall(context, 'coach_chat', () =>
      Promise.resolve({ result: 'Hello!', usage: USAGE }),
    );

    assertEquals(done.result, 'Hello!');
    assertEquals(logged, ['record_ai_usage: No price is known']);
  } finally {
    console.error = error;
  }
});
