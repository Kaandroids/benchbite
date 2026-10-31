import { assertEquals } from '@std/assert';

import { readBody, readJson, TOO_LARGE } from './request.ts';

const post = (body: BodyInit) => new Request('http://localhost/', { method: 'POST', body });

Deno.test('reads a body within the limit, whatever its characters', async () => {
  assertEquals(await readBody(post('{"a":"ö"}'), 100), '{"a":"ö"}');
  assertEquals(await readBody(post('x'.repeat(101)), 100), undefined);
});

Deno.test('stops reading a body without a length once it passes the limit', async () => {
  let pulled = 0;
  const chunk = new Uint8Array(1_000_000).fill(120);
  const endless = new ReadableStream<Uint8Array>({
    pull: (controller) => {
      pulled++;
      controller.enqueue(chunk);
    },
  });
  const request = post(endless);
  assertEquals(request.headers.get('content-length'), null);

  assertEquals(await readBody(request, 4_000_000), undefined);
  // About as many megabytes as the limit, not the whole stream.
  assertEquals(pulled <= 6, true);
});

Deno.test('reads a body as JSON, refusing one too large before it is read', async () => {
  assertEquals(await readJson(post('{"a":1}'), 100), { a: 1 });
  assertEquals(await readJson(post('not json'), 100), null);
  assertEquals(await readJson(post('x'.repeat(101)), 100), TOO_LARGE);
  const saysTooMuch = new Request('http://localhost/', {
    method: 'POST',
    body: '{}',
    headers: { 'content-length': '101' },
  });
  assertEquals(await readJson(saysTooMuch, 100), TOO_LARGE);
});
