import { createClient } from '@supabase/supabase-js';

import { postFunction } from './supabase';
import { onVersionRefused } from './version-refusal';

// In place of the storage the app installs, which needs the native database.
jest.mock('expo-sqlite/localStorage/install', () => {
  Object.assign(globalThis, { localStorage: {} });
  return {};
});
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }),
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
    },
  })),
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.4.2' }));

// The backend refuses a build that is no longer supported by these two headers (ADR 0157).
const BUILD = { 'x-app-platform': 'ios', 'x-app-version': '1.4.2' };

it('names the build in every request of the client', () => {
  expect(jest.mocked(createClient).mock.calls[0]?.[2]).toMatchObject({
    global: { headers: BUILD },
  });
});

it('looks at every answer for the backend’s refusal of this build', async () => {
  const refused = jest.fn();
  const stop = onVersionRefused(refused);
  globalThis.fetch = jest.fn().mockResolvedValue({ status: 426 });
  const options = jest.mocked(createClient).mock.calls[0]?.[2];
  await options?.global?.fetch?.('https://example.test/rest/v1/workouts');
  expect(refused).toHaveBeenCalledTimes(1);
  stop();
});

it('posts to an Edge Function with the key, the token and the build, and looks at its answer', async () => {
  const refused = jest.fn();
  const stop = onVersionRefused(refused);
  const answer = { status: 426 };
  globalThis.fetch = jest.fn().mockResolvedValue(answer);

  expect(await postFunction('coach-chat', { message: 'Hi' })).toBe(answer);

  const [url, init] = jest.mocked(globalThis.fetch).mock.calls[0] ?? [];
  expect(String(url)).toMatch(/\/functions\/v1\/coach-chat$/);
  expect(init).toMatchObject({
    method: 'POST',
    headers: { ...BUILD, authorization: 'Bearer token', 'content-type': 'application/json' },
    body: '{"message":"Hi"}',
  });
  expect(refused).toHaveBeenCalledTimes(1);
  stop();
});
