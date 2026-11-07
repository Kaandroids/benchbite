// Sending an email from an Edge Function (ADR 0094). Edge Functions cannot use the usual SMTP
// ports, so the hosted project sends through Lettermint's HTTP API; locally, Mailpit takes it.

export type Email = { to: string; subject: string; html: string; text: string };

export type Send = (email: Email) => Promise<void>;

const FROM = { name: 'Benchbite', address: 'no-reply@benchbite.com' };

/**
 * Sends through Lettermint with `LETTERMINT_API_TOKEN`, or through Mailpit at `MAILPIT_URL` when
 * only that is set, as locally. Fails when it has neither, or when the email is not accepted.
 */
export function emailSender(env: (name: string) => string | undefined = Deno.env.get): Send {
  const token = env('LETTERMINT_API_TOKEN');
  const mailpit = env('MAILPIT_URL');
  return ({ to, subject, html, text }) => {
    if (token) {
      return post(
        'https://api.lettermint.co/v1/send',
        { 'x-lettermint-token': token },
        { from: `${FROM.name} <${FROM.address}>`, to: [to], subject, html, text },
      );
    }
    if (mailpit) {
      return post(
        `${mailpit}/api/v1/send`,
        {},
        {
          From: { Email: FROM.address, Name: FROM.name },
          To: [{ Email: to }],
          Subject: subject,
          HTML: html,
          Text: text,
        },
      );
    }
    return Promise.reject(
      new Error('No way to send email: neither LETTERMINT_API_TOKEN nor MAILPIT_URL is set'),
    );
  };
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Sending an email failed with ${response.status}`);
  }
  await response.body?.cancel();
}
