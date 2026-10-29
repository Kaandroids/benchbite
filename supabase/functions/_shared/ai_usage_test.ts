import { assertEquals, assertRejects } from '@std/assert';

import { type AiAccess, recordAiUsage, startAiCall } from './ai_usage.ts';

/** A database that answers every call with `result`, keeping what it was asked. */
function database(result: { data: unknown; error: { message: string } | null }) {
  const calls: { name: string; args?: unknown }[] = [];
  const client = {
    rpc: (name: string, args?: unknown) => {
      calls.push({ name, args });
      return Promise.resolve(result);
    },
  } as unknown as Parameters<typeof startAiCall>[0];
  return { client, calls };
}

Deno.test('asks the database to start a call', async () => {
  const access: AiAccess = {
    allowed: false,
    reason: 'limit_reached',
    budget_usd: 4,
    used_usd: 4.2,
    resets_at: '2026-11-01T00:00:00+00:00',
  };
  const { client, calls } = database({ data: access, error: null });

  assertEquals(await startAiCall(client, 'coach_chat', 'gemini-3.5-flash-lite'), access);
  assertEquals(calls, [
    { name: 'start_ai_call', args: { feature: 'coach_chat', model: 'gemini-3.5-flash-lite' } },
  ]);
});

Deno.test('records the tokens of a call, which the database prices', async () => {
  const { client, calls } = database({ data: 0.000442, error: null });

  const cost = await recordAiUsage(client, 'user-1', 'coach_chat', {
    model: 'gemini-3.5-flash-lite',
    inputTokens: 1000,
    cachedInputTokens: 400,
    outputTokens: 100,
    thinkingTokens: 20,
  });

  assertEquals(cost, 0.000442);
  assertEquals(calls, [
    {
      name: 'record_ai_usage',
      args: {
        user_id: 'user-1',
        feature: 'coach_chat',
        model: 'gemini-3.5-flash-lite',
        input_tokens: 1000,
        cached_input_tokens: 400,
        output_tokens: 100,
        thinking_tokens: 20,
      },
    },
  ]);
});

Deno.test('says so when the database fails', async () => {
  const { client } = database({ data: null, error: { message: 'No price is known' } });

  await assertRejects(
    () => startAiCall(client, 'review', 'x'),
    Error,
    'start_ai_call: No price is known',
  );
  await assertRejects(
    () =>
      recordAiUsage(client, 'user-1', 'review', {
        model: 'x',
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
      }),
    Error,
    'record_ai_usage: No price is known',
  );
});
