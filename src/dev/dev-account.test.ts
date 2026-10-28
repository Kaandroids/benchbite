import { isLocalSupabase } from './dev-account';

describe('isLocalSupabase', () => {
  it.each([
    'http://127.0.0.1:54321',
    'http://localhost:54321',
    'http://10.0.2.2:54321',
    'http://192.168.2.226:54321',
    'http://10.1.2.3:54321',
    'http://172.20.0.5:54321',
  ])('takes %s as the local database', (url) => {
    expect(isLocalSupabase(url)).toBe(true);
  });

  it.each([
    'https://abcdefgh.supabase.co',
    'http://172.32.0.1:54321',
    'http://8.8.8.8',
    'not a url',
    undefined,
  ])('does not take %s', (url) => {
    expect(isLocalSupabase(url)).toBe(false);
  });
});
