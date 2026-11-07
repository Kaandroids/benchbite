import { assertEquals, assertRejects } from '@std/assert';

import { emailSender } from './email.ts';

const EMAIL = { to: 'kaan@example.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' };

function withFetch(status: number, run: (requests: Request[]) => Promise<void>) {
  const requests: Request[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    requests.push(new Request(input, init));
    return Promise.resolve(new Response('{}', { status }));
  };
  return run(requests).finally(() => {
    globalThis.fetch = original;
  });
}

Deno.test('sends through Lettermint with its token', () =>
  withFetch(202, async (requests) => {
    await emailSender((name) => (name === 'LETTERMINT_API_TOKEN' ? 'token' : undefined))(EMAIL);
    assertEquals(requests[0]!.url, 'https://api.lettermint.co/v1/send');
    assertEquals(requests[0]!.headers.get('x-lettermint-token'), 'token');
    const body = await requests[0]!.json();
    assertEquals(body.from, 'Benchbite <no-reply@benchbite.com>');
    assertEquals(body.to, ['kaan@example.com']);
  }),
);

Deno.test('sends to Mailpit locally', () =>
  withFetch(200, async (requests) => {
    await emailSender((name) => (name === 'MAILPIT_URL' ? 'http://mailpit:8025' : undefined))(
      EMAIL,
    );
    assertEquals(requests[0]!.url, 'http://mailpit:8025/api/v1/send');
    assertEquals((await requests[0]!.json()).To, [{ Email: 'kaan@example.com' }]);
  }),
);

Deno.test('fails when the email is not accepted, or there is no way to send', () =>
  withFetch(422, async () => {
    const send = emailSender((name) => (name === 'LETTERMINT_API_TOKEN' ? 'token' : undefined));
    await assertRejects(() => send(EMAIL));
    await assertRejects(() => emailSender(() => undefined)(EMAIL), Error, 'MAILPIT_URL');
  }),
);
