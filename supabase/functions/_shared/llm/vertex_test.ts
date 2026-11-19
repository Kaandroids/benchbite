import { assertEquals, assertRejects } from '@std/assert';
import { fromBase64, toBase64 } from '../base64_bytes.ts';
import { GeminiModel } from './gemini.ts';
import { ModelError, type ModelRequest } from './types.ts';
import { forgetTokens, type ServiceAccount, vertexAi } from './vertex.ts';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const MODELS =
  'https://aiplatform.eu.rep.googleapis.com/v1/projects/project/locations/eu/publishers/google/models';

const keys = await crypto.subtle.generateKey(
  {
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  },
  true,
  ['sign', 'verify'],
);
const pkcs8 = toBase64(new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey)));
/** As a key file holds it: the key in lines, between its two markers. */
const ACCOUNT: ServiceAccount = {
  projectId: 'project',
  clientEmail: 'bite@project.iam.gserviceaccount.com',
  privateKey: `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`,
};

const fromBase64Url = (text: string) =>
  fromBase64(
    text.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (text.length % 4)) % 4),
  );
const json = (part: string) => JSON.parse(new TextDecoder().decode(fromBase64Url(part)));

/** Vertex AI at a time the test moves, with a Google that answers token requests with `token`. */
function vertex(token: () => Response | Promise<Response>) {
  forgetTokens();
  const clock = { now: 1_800_000_000_000 };
  const claims: string[] = [];
  const calls: { url: string; headers: Headers; body: unknown }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input) === TOKEN_URL) {
      claims.push(new URLSearchParams(String(init?.body)).get('assertion') ?? '');
      return await token();
    }
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    return Response.json({ candidates: [], totalTokens: 7 });
  };
  const endpoint = vertexAi(ACCOUNT, { fetch: fetcher, now: () => clock.now });
  const model = new GeminiModel({
    endpoint,
    models: () => ({ model: 'gemini-chat', thinking: 'low' }),
    fetch: fetcher,
  });
  return { endpoint, model, clock, claims, calls };
}

const granted = (value: string) => () => Response.json({ access_token: value, expires_in: 3600 });
const HI: ModelRequest = {
  task: 'coach_chat',
  messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hi' }] }],
};

Deno.test('calls the model in the EU, with the token Google gives for a signed claim', async () => {
  const { model, claims, calls } = vertex(granted('token-1'));

  await model.generate(HI);

  assertEquals(calls[0].url, `${MODELS}/gemini-chat:generateContent`);
  assertEquals(calls[0].headers.get('authorization'), 'Bearer token-1');
  assertEquals(calls[0].headers.get('x-goog-api-key'), null);
  const [header, claim, signature] = claims[0].split('.');
  assertEquals(json(header), { alg: 'RS256', typ: 'JWT' });
  assertEquals(json(claim), {
    iss: 'bite@project.iam.gserviceaccount.com',
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: TOKEN_URL,
    iat: 1_800_000_000,
    exp: 1_800_003_600,
  });
  assertEquals(
    await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      keys.publicKey,
      new Uint8Array(fromBase64Url(signature)),
      new TextEncoder().encode(`${header}.${claim}`),
    ),
    true,
  );
});

Deno.test('streams from the same place', async () => {
  const { model, calls } = vertex(granted('token-1'));

  // The stand-in's answer is no stream, which ends it at once; the address is what counts.
  await assertRejects(async () => {
    for await (const _ of model.stream(HI));
  }, ModelError);

  assertEquals(calls[0].url, `${MODELS}/gemini-chat:streamGenerateContent?alt=sse`);
});

Deno.test('counts the request as it is, not wrapped as for the Developer API', async () => {
  const { model, calls } = vertex(granted('token-1'));

  assertEquals(await model.countTokens(HI), 7);

  assertEquals(calls[0].url, `${MODELS}/gemini-chat:countTokens`);
  assertEquals(calls[0].body, {
    contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
    generationConfig: { thinkingConfig: { thinkingLevel: 'low' } },
  });
});

Deno.test(
  'counts a request that forbids tool calls without saying so, which Vertex AI refuses',
  async () => {
    const { model, calls } = vertex(granted('token-1'));

    await model.countTokens({
      ...HI,
      tools: [{ name: 'logMeal', description: 'Logs a meal.', parameters: { type: 'object' } }],
      toolChoice: 'none',
    });
    await model.generate({ ...HI, toolChoice: 'none' });

    const counted = calls[0].body as Record<string, unknown>;
    assertEquals(Object.keys(counted).sort(), ['contents', 'generationConfig', 'tools']);
    // The call itself still says so.
    assertEquals((calls[1].body as Record<string, unknown>).toolConfig, {
      functionCallingConfig: { mode: 'NONE' },
    });
  },
);

Deno.test('keeps a token until shortly before it ends, also for a model set up anew', async () => {
  let count = 0;
  const { endpoint, clock, claims } = vertex(() =>
    Response.json({ access_token: `token-${++count}`, expires_in: 3600 }),
  );

  assertEquals(await endpoint.headers(), { authorization: 'Bearer token-1' });
  clock.now += 54 * 60_000;
  // As each request does: another endpoint for the same account.
  const again = vertexAi(ACCOUNT, { fetch: () => Promise.reject(new Error('asked again')) });
  assertEquals(await again.headers(), { authorization: 'Bearer token-1' });
  assertEquals(await endpoint.headers(), { authorization: 'Bearer token-1' });
  assertEquals(claims.length, 1);

  // Five minutes before its end, it is renewed.
  clock.now += 60_000;
  assertEquals(await endpoint.headers(), { authorization: 'Bearer token-2' });
  assertEquals(claims.length, 2);
  assertEquals(json(claims[1].split('.')[1]).iat, 1_800_003_300);
});

Deno.test('asks once for requests that need a token at the same time', async () => {
  let release = (_: Response) => {};
  const { endpoint, claims } = vertex(
    () => new Promise<Response>((resolve) => (release = resolve)),
  );

  const both = Promise.all([endpoint.headers(), endpoint.headers()]);
  // Past the signing, to where the one request waits for Google.
  while (claims.length === 0) await new Promise((resolve) => setTimeout(resolve, 1));
  release(Response.json({ access_token: 'token-1', expires_in: 3600 }));

  assertEquals(await both, [
    { authorization: 'Bearer token-1' },
    { authorization: 'Bearer token-1' },
  ]);
  assertEquals(claims.length, 1);
});

Deno.test(
  'throws an unbilled model error when Google gives no token, and asks again next time',
  async () => {
    let answer = () => Response.json({ error: 'invalid_grant' }, { status: 400 });
    const { model, endpoint, calls } = vertex(() => answer());

    const refused = await assertRejects(() => model.generate(HI), ModelError, '400 invalid_grant');
    assertEquals([refused.status, refused.retryable, refused.billed], [400, false, false]);
    // Nothing went to the model.
    assertEquals(calls.length, 0);

    answer = () => Response.json({ error: 'internal_failure' }, { status: 503 });
    const outage = await assertRejects(() => endpoint.headers(), ModelError);
    assertEquals([outage.status, outage.retryable, outage.billed], [503, true, false]);

    answer = () => Response.json({ token_type: 'Bearer' });
    const empty = await assertRejects(() => endpoint.headers(), ModelError);
    assertEquals([empty.status, empty.retryable], [502, true]);

    answer = () => Response.json({ access_token: 'token-1', expires_in: 3600 });
    assertEquals(await endpoint.headers(), { authorization: 'Bearer token-1' });
  },
);

Deno.test('throws a retryable model error when Google cannot be reached', async () => {
  const { endpoint } = vertex(() => Promise.reject(new TypeError('connection reset')));

  const error = await assertRejects(() => endpoint.headers(), ModelError, 'connection reset');
  assertEquals([error.status, error.retryable, error.billed], [503, true, false]);
});

Deno.test('gives Google five seconds for a token, and asks anew after one that hung', async () => {
  let signal: AbortSignal | null | undefined;
  const hung: typeof fetch = (_input, init) => {
    signal = init?.signal;
    return Promise.reject(new DOMException('The signal timed out', 'TimeoutError'));
  };
  forgetTokens();

  const error = await assertRejects(
    () => vertexAi(ACCOUNT, { fetch: hung }).headers(),
    ModelError,
    'timed out',
  );
  assertEquals([error.status, error.retryable, error.billed], [503, true, false]);
  assertEquals(signal instanceof AbortSignal, true);

  // Without forgetting anything: the request that hung is not waited for again.
  const again = vertexAi(ACCOUNT, { fetch: () => Promise.resolve(granted('token-1')()) });
  assertEquals(await again.headers(), { authorization: 'Bearer token-1' });
});

Deno.test('says a key that cannot sign without telling it', async () => {
  forgetTokens();
  const endpoint = vertexAi(
    { ...ACCOUNT, privateKey: '-----BEGIN PRIVATE KEY-----\nc2VjcmV0\n-----END PRIVATE KEY-----' },
    { fetch: () => Promise.reject(new Error('asked')) },
  );

  const error = await assertRejects(() => endpoint.headers(), ModelError);
  assertEquals(error.message, 'Vertex AI: the service account key cannot sign');
  assertEquals([error.status, error.retryable, error.billed], [500, false, false]);
});
