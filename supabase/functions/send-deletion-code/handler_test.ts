import { assert, assertEquals } from '@std/assert';

import { codeHash } from '../_shared/deletion_code.ts';
import type { Email } from '../_shared/email.ts';
import type { Client } from '../_shared/supabase.ts';
import { handleSendCode } from './handler.ts';

const A = '00000000-0000-0000-0000-00000000000a';

/** A stand-in for the service role client: the one call, its arguments and its answer. */
function context(
  answer: { data: string | null; error: { message: string } | null },
  { guest = false, accountLocale = 'en', sendFails = false, email = 'kaan@example.com' } = {},
) {
  const calls: Record<string, string>[] = [];
  const takenBack: Record<string, string>[] = [];
  const sent: Email[] = [];
  const admin = {
    rpc: (fn: string, args: Record<string, string>) => {
      if (fn === 'take_back_account_deletion_code') {
        takenBack.push(args);
        return Promise.resolve({ data: null, error: null });
      }
      assertEquals(fn, 'new_account_deletion_code');
      calls.push(args);
      return Promise.resolve(answer);
    },
    auth: {
      admin: {
        getUserById: () =>
          Promise.resolve({
            data: {
              user: {
                is_anonymous: guest,
                email: guest ? undefined : email,
                user_metadata: { locale: accountLocale },
              },
            },
            error: null,
          }),
      },
    },
  } as unknown as Client;
  const send = (email: Email) => {
    sent.push(email);
    return sendFails ? Promise.reject(new Error('down')) : Promise.resolve();
  };
  return {
    calls,
    takenBack,
    sent,
    ctx: { admin, send, userId: A },
  };
}

const post = (body?: unknown) =>
  new Request('http://localhost/send-deletion-code', {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

Deno.test('emails the account a code in the app’s language and keeps only its hash', async () => {
  const { ctx, calls, sent } = context({ data: 'sent', error: null });

  const response = await handleSendCode(post({ locale: 'de' }), ctx);

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { sent: true });
  assertEquals(sent.length, 1);
  assertEquals(sent[0]!.to, 'kaan@example.com');
  const code = sent[0]!.subject.match(/^\d{6}/)![0];
  assert(sent[0]!.subject.includes('Benchbite-Kontos'));
  assert(sent[0]!.html.includes(`>${code}</p>`));
  assertEquals(calls, [
    { p_user: A, p_code_hash: await codeHash(A, code), p_email: 'kaan@example.com' },
  ]);
});

Deno.test('writes in the account’s language when the app names none', async () => {
  const { ctx, sent } = context({ data: 'sent', error: null }, { accountLocale: 'tr' });

  await handleSendCode(post(), ctx);

  assert(sent[0]!.subject.endsWith('Benchbite hesabını silme kodun'));
});

Deno.test('sends nothing within a minute of the last code, or after 5 in an hour', async () => {
  for (const [said, refusal] of [
    ['too_soon', 'too_soon'],
    ['too_many', 'too_many_codes'],
  ]) {
    const { ctx, sent } = context({ data: said!, error: null });

    const response = await handleSendCode(post({ locale: 'en' }), ctx);

    assertEquals(response.status, 429);
    assertEquals(await response.json(), { error: refusal });
    assertEquals(sent, []);
  }
});

Deno.test('says so when the code cannot be kept or sent', async () => {
  const failing = [
    context({ data: null, error: { message: 'down' } }),
    context({ data: 'sent', error: null }, { sendFails: true }),
  ];
  for (const { ctx } of failing) {
    const response = await handleSendCode(post(), ctx);

    assertEquals(response.status, 503);
  }
  assertEquals(failing[0]!.sent, []);
});

Deno.test('sends nothing when the address changed as the code was kept', async () => {
  const { ctx, sent } = context({ data: 'address_changed', error: null });

  const response = await handleSendCode(post(), ctx);

  assertEquals(response.status, 503);
  assertEquals(await response.json(), { error: 'unavailable' });
  assertEquals(sent, []);
});

Deno.test('sends nothing to a guest, who has no address', async () => {
  const { ctx, calls } = context({ data: 'sent', error: null }, { guest: true });

  const response = await handleSendCode(post(), ctx);

  assertEquals(response.status, 400);
  assertEquals(calls, []);
});

Deno.test('takes only POST requests', async () => {
  const { ctx, calls } = context({ data: 'sent', error: null });

  const response = await handleSendCode(new Request('http://localhost/send-deletion-code'), ctx);

  assertEquals(response.status, 405);
  assertEquals(calls, []);
});

Deno.test('takes back a code whose email could not be sent', async () => {
  const { ctx, calls, takenBack } = context({ data: 'sent', error: null }, { sendFails: true });

  const response = await handleSendCode(post(), ctx);

  assertEquals(response.status, 503);
  assertEquals(takenBack, [{ p_user: A, p_code_hash: calls[0]!.p_code_hash! }]);
});

Deno.test('sends the code to the address as stored, not as the token had it', async () => {
  const { ctx, sent } = context({ data: 'sent', error: null }, { email: 'new@example.com' });

  await handleSendCode(post(), ctx);

  assertEquals(sent[0]!.to, 'new@example.com');
});
