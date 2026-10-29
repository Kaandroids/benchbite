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

/** The two clients of a call, answering with `access`, and the calls each was asked. */
function clients(access: AiAccess) {
  const calls: { client: string; name: string; args: unknown }[] = [];
  const client = (name: string) =>
    ({
      rpc: (fn: string, args: unknown) => {
        calls.push({ client: name, name: fn, args });
        return Promise.resolve({ data: fn === 'start_ai_call' ? access : 0.0004, error: null });
      },
    }) as unknown as AiCallContext['supabase'];
  const context: AiCallContext = {
    supabase: client('user'),
    admin: client('admin'),
    userId: 'user-1',
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

Deno.test('starts the call as the user, runs it and records its usage', async () => {
  const { context, calls } = clients(ACCESS);

  const access = await withAiCall(context, 'coach_chat', 'gemini-3.5-flash-lite', () =>
    Promise.resolve(USAGE),
  );

  assertEquals(access, ACCESS);
  assertEquals(calls, [START, recorded(USAGE)]);
});

Deno.test('runs nothing when the user may not make the call', async () => {
  const { context, calls } = clients({
    ...ACCESS,
    allowed: false,
    reason: 'limit_reached',
    call_id: null,
  });
  let ran = false;

  const access = await withAiCall(context, 'coach_chat', 'gemini-3.5-flash-lite', () => {
    ran = true;
    return Promise.resolve(USAGE);
  });

  assertEquals([access.allowed, access.reason, ran], [false, 'limit_reached', false]);
  assertEquals(calls, [START]);
});

Deno.test('records what a failed call used, and throws its error on', async () => {
  const { context, calls } = clients(ACCESS);
  const partial = { ...USAGE, outputTokens: 8, thinkingTokens: 0 };

  await assertRejects(
    () =>
      withAiCall(context, 'coach_chat', 'gemini-3.5-flash-lite', () =>
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
    () =>
      withAiCall(context, 'coach_chat', 'gemini-3.5-flash-lite', () =>
        Promise.reject(new Error('Bad input')),
      ),
    Error,
    'Bad input',
  );
  assertEquals(calls, [
    START,
    recorded({
      ...USAGE,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
    }),
  ]);
});
