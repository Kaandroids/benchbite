import { CaptchaError, captchaToken, setCaptchaHost } from './captcha';

// The real bridge, not the stand-in every other test gets.
jest.unmock('./captcha');

afterEach(() => setCaptchaHost(null));

it('asks the host for a token, one request at a time', async () => {
  const order: string[] = [];
  let release: () => void = () => {};
  setCaptchaHost(async ({ cancellable }) => {
    order.push(`start ${cancellable}`);
    if (order.length === 1) await new Promise<void>((resolve) => (release = resolve));
    order.push('end');
    return `token ${order.length}`;
  });

  const first = captchaToken({ cancellable: false });
  const second = captchaToken();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(order).toEqual(['start false']);
  release();

  await expect(first).resolves.toBe('token 2');
  await expect(second).resolves.toBe('token 4');
  expect(order).toEqual(['start false', 'end', 'start true', 'end']);
});

it('goes on to the next request after one failed', async () => {
  setCaptchaHost(
    jest.fn().mockRejectedValueOnce(new CaptchaError('failed')).mockResolvedValue('t'),
  );
  await expect(captchaToken()).rejects.toMatchObject({ reason: 'failed' });
  await expect(captchaToken()).resolves.toBe('t');
});

it('waits for the host, as when the app has just started', async () => {
  const token = captchaToken();
  setCaptchaHost(() => Promise.resolve('late'));
  await expect(token).resolves.toBe('late');
});

it('fails when no host comes', async () => {
  jest.useFakeTimers();
  try {
    const token = captchaToken();
    await jest.advanceTimersByTimeAsync(10_000);
    await expect(token).rejects.toMatchObject({ reason: 'failed' });
  } finally {
    jest.useRealTimers();
  }
});

it('reports a check that failed, but not one closed or a page that could not load', () => {
  expect(new CaptchaError('failed', 'timeout').expected).toBe(false);
  expect(new CaptchaError('failed', '600010').expected).toBe(false);
  expect(new CaptchaError('failed', 'load').expected).toBe(true);
  expect(new CaptchaError('cancelled').expected).toBe(true);
});
