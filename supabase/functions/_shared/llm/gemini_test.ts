import { assertEquals, assertRejects } from '@std/assert';
import { GeminiModel } from './gemini.ts';
import { ModelError, type ModelRequest, type StreamEvent } from './types.ts';

const CHAT = { model: 'gemini-chat', thinking: 'low' } as const;

/** A Gemini that answers every call with `response`, keeping what it was sent. */
function gemini(response: () => Response) {
  const calls: { url: string; headers: Headers; body: unknown }[] = [];
  const model = new GeminiModel({
    apiKey: 'test-key',
    models: () => CHAT,
    fetch: (input, init) => {
      calls.push({
        url: String(input),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)),
      });
      return Promise.resolve(response());
    },
  });
  return { model, calls };
}

function sse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

const USAGE = {
  promptTokenCount: 120,
  candidatesTokenCount: 30,
  thoughtsTokenCount: 12,
  cachedContentTokenCount: 100,
};

const request: ModelRequest = {
  task: 'chat',
  system: 'You are Bite.',
  messages: [
    {
      role: 'user',
      parts: [
        { type: 'text', text: 'What is on this plate?' },
        { type: 'image', mimeType: 'image/jpeg', data: 'aW1hZ2U=' },
      ],
    },
    {
      role: 'model',
      parts: [
        { type: 'toolCall', id: 'c1', name: 'logMeal', args: { kcal: 500 }, signature: 's1' },
      ],
    },
    { role: 'user', parts: [{ type: 'toolResult', id: 'c1', name: 'logMeal', result: 'saved' }] },
  ],
  tools: [{ name: 'logMeal', description: 'Logs a meal.', parameters: { type: 'object' } }],
  responseSchema: { type: 'object' },
  maxOutputTokens: 400,
};

Deno.test('sends the request in Gemini terms, with the key in a header', async () => {
  const { model, calls } = gemini(() => Response.json({ candidates: [] }));

  await model.generate(request);

  assertEquals(
    calls[0].url,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-chat:generateContent',
  );
  assertEquals(calls[0].headers.get('x-goog-api-key'), 'test-key');
  assertEquals(calls[0].body, {
    systemInstruction: { parts: [{ text: 'You are Bite.' }] },
    contents: [
      {
        role: 'user',
        parts: [
          { text: 'What is on this plate?' },
          { inlineData: { mimeType: 'image/jpeg', data: 'aW1hZ2U=' } },
        ],
      },
      {
        role: 'model',
        parts: [
          {
            functionCall: { id: 'c1', name: 'logMeal', args: { kcal: 500 } },
            thoughtSignature: 's1',
          },
        ],
      },
      {
        role: 'user',
        parts: [{ functionResponse: { id: 'c1', name: 'logMeal', response: { result: 'saved' } } }],
      },
    ],
    tools: [
      {
        functionDeclarations: [
          {
            name: 'logMeal',
            description: 'Logs a meal.',
            parametersJsonSchema: { type: 'object' },
          },
        ],
      },
    ],
    generationConfig: {
      thinkingConfig: { thinkingLevel: 'low' },
      maxOutputTokens: 400,
      responseMimeType: 'application/json',
      responseJsonSchema: { type: 'object' },
    },
  });
});

Deno.test('leaves out what the request does not use', async () => {
  const { model, calls } = gemini(() => Response.json({ candidates: [] }));

  await model.generate({
    task: 'chat',
    messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hi' }] }],
  });

  assertEquals(calls[0].body, {
    contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
    generationConfig: { thinkingConfig: { thinkingLevel: 'low' } },
  });
});

Deno.test('reads the answer without the reasoning, and the usage with it', async () => {
  const { model } = gemini(() =>
    Response.json({
      candidates: [
        {
          content: {
            parts: [
              { text: 'Weighing it up…', thought: true },
              { text: 'Pasta, about 600 kcal.', thoughtSignature: 's2' },
              { functionCall: { name: 'logMeal', args: { kcal: 600 } } },
            ],
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: USAGE,
      modelVersion: 'gemini-chat-001',
    }),
  );

  assertEquals(await model.generate(request), {
    parts: [
      { type: 'text', text: 'Pasta, about 600 kcal.', signature: 's2' },
      { type: 'toolCall', name: 'logMeal', args: { kcal: 600 } },
    ],
    usage: {
      model: 'gemini-chat-001',
      inputTokens: 120,
      outputTokens: 42,
      thinkingTokens: 12,
      cachedInputTokens: 100,
    },
    finish: 'stop',
  });
});

Deno.test('tells a blocked prompt and a cut-off answer apart from a finished one', async () => {
  const blocked = gemini(() => Response.json({ promptFeedback: { blockReason: 'SAFETY' } }));
  const cut = gemini(() =>
    Response.json({
      candidates: [{ content: { parts: [{ text: 'Pas' }] }, finishReason: 'MAX_TOKENS' }],
    }),
  );

  assertEquals((await blocked.model.generate(request)).finish, 'blocked');
  assertEquals((await cut.model.generate(request)).finish, 'length');
});

Deno.test('streams the text as it comes and ends with the usage of the whole call', async () => {
  const { model, calls } = gemini(() =>
    sse([
      'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\r\n\r\n',
      // An event split across two reads.
      'data: {"candidates":[{"content":{"parts":[{"te',
      'xt":"lo!"}]}}],"usageMetadata":{"promptTokenCount":5}}\r\n\r\n',
      'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"logMeal","args":{}}}]},' +
        '"finishReason":"STOP"}],"usageMetadata":' +
        JSON.stringify(USAGE) +
        '}\r\n\r\n',
    ]),
  );

  const events: StreamEvent[] = [];
  for await (const event of model.stream(request)) events.push(event);

  assertEquals(
    calls[0].url,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-chat:streamGenerateContent?alt=sse',
  );
  assertEquals(events, [
    { type: 'text', text: 'Hel' },
    { type: 'text', text: 'lo!' },
    { type: 'toolCall', name: 'logMeal', args: {} },
    {
      type: 'done',
      usage: {
        model: 'gemini-chat',
        inputTokens: 120,
        outputTokens: 42,
        thinkingTokens: 12,
        cachedInputTokens: 100,
      },
      finish: 'stop',
    },
  ]);
});

Deno.test('throws a model error, retryable for limits and outages only', async () => {
  const limited = gemini(() =>
    Response.json({ error: { message: 'Quota exceeded' } }, { status: 429 }),
  );
  const wrong = gemini(() => Response.json({ error: { message: 'Bad schema' } }, { status: 400 }));

  const limit = await assertRejects(() => limited.model.generate(request), ModelError);
  assertEquals(
    [limit.status, limit.retryable, limit.message],
    [429, true, 'Gemini: 429 Quota exceeded'],
  );
  const bad = await assertRejects(
    () => wrong.model.stream(request)[Symbol.asyncIterator]().next(),
    ModelError,
  );
  assertEquals([bad.status, bad.retryable], [400, false]);
});
