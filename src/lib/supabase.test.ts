import { createClient } from '@supabase/supabase-js';

import { functionHeaders } from './supabase';

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

it('names the build in a request to an Edge Function, beside the key and the token', async () => {
  expect(await functionHeaders()).toMatchObject({ ...BUILD, authorization: 'Bearer token' });
});
