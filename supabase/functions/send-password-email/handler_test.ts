import { assert, assertEquals, assertStringIncludes } from '@std/assert';

import type { Email } from '../_shared/email.ts';
import type { Client } from '../_shared/supabase.ts';
import { handlePasswordEmail } from './handler.ts';

const A = '00000000-0000-0000-0000-00000000000a';

/** A stand-in for the service role client, which reads the user, and a sender that keeps what it sends. */
function context(
  user: { email?: string; locale?: string; guest?: boolean } | 'gone' | 'down' = {
    email: 'kaan@example.com',
    locale: 'en',
  },
  { sendFails = false } = {},
) {
  const sent: Email[] = [];
  const admin = {
    auth: {
      admin: {
        getUserById: () =>
          Promise.resolve(
            user === 'gone'
              ? { data: { user: null }, error: { status: 404, message: 'User not found' } }
              : user === 'down'
                ? { data: { user: null }, error: { status: 500, message: 'down' } }
                : {
                    data: {
                      user: {
                        is_anonymous: user.guest === true,
                        email: user.email,
                        user_metadata: { locale: user.locale },
                      },
                    },
                    error: null,
                  },
          ),
      },
    },
  } as unknown as Client;
  const send = (email: Email) => {
    sent.push(email);
    return sendFails ? Promise.reject(new Error('down')) : Promise.resolve();
  };
  return { sent, context: { admin, send } };
}

const request = (body: unknown, method = 'POST') =>
  new Request('http://functions.test/send-password-email', {
    method,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });

Deno.test('welcomes an account for its first password, in its language', async () => {
  const { sent, context: ctx } = context({ email: 'kaan@example.com', locale: 'de' });
  const res = await handlePasswordEmail(request({ userId: A, kind: 'welcome' }), ctx);
  assertEquals(res.status, 200);
  assertEquals(sent.length, 1);
  assertEquals(sent[0].to, 'kaan@example.com');
  assertEquals(sent[0].subject, 'Willkommen bei Benchbite');
  assertStringIncludes(sent[0].html, 'Dein Konto ist bereit');
  assertStringIncludes(sent[0].text, 'Nichts geht verloren, wenn du die App löschst.');
  assertStringIncludes(sent[0].text, 'Melde dich mit dieser Adresse und dem Passwort an');
});

Deno.test('says a later password was changed', async () => {
  const { sent, context: ctx } = context();
  const res = await handlePasswordEmail(request({ userId: A, kind: 'changed' }), ctx);
  assertEquals(res.status, 200);
  assertEquals(sent[0].subject, 'Your Benchbite password was changed');
  assertStringIncludes(sent[0].text, 'Wasn’t you?');
});

Deno.test('emails nobody for a guest or a user deleted meanwhile', async () => {
  for (const user of [{ guest: true }, 'gone'] as const) {
    const { sent, context: ctx } = context(user);
    const res = await handlePasswordEmail(request({ userId: A, kind: 'welcome' }), ctx);
    assertEquals(res.status, 200);
    assertEquals(sent, []);
  }
});

Deno.test('refuses a request it cannot read, and other methods', async () => {
  for (const body of [
    {},
    { userId: A },
    { userId: A, kind: 'reset' },
    { userId: 1, kind: 'welcome' },
  ]) {
    const { sent, context: ctx } = context();
    assertEquals((await handlePasswordEmail(request(body), ctx)).status, 400);
    assertEquals(sent, []);
  }
  const { context: ctx } = context();
  assertEquals((await handlePasswordEmail(request(null, 'GET'), ctx)).status, 405);
});

Deno.test('says so when the user cannot be read or the email cannot be sent', async () => {
  const down = context('down');
  assertEquals(
    (await handlePasswordEmail(request({ userId: A, kind: 'welcome' }), down.context)).status,
    503,
  );
  const failing = context(undefined, { sendFails: true });
  const res = await handlePasswordEmail(request({ userId: A, kind: 'welcome' }), failing.context);
  assertEquals(res.status, 503);
  assert(failing.sent.length === 1);
});

Deno.test('writes each email in every language, with the welcome’s points listed', async () => {
  for (const locale of ['en', 'de', 'tr']) {
    for (const kind of ['welcome', 'changed']) {
      const { sent, context: ctx } = context({ email: 'kaan@example.com', locale });
      await handlePasswordEmail(request({ userId: A, kind }), ctx);
      assertEquals(sent.length, 1, `${kind} in ${locale}`);
      assertEquals(sent[0].html.includes('<ul'), kind === 'welcome', `${kind} in ${locale}`);
    }
  }
});
