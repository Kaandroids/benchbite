import { assertEquals } from '@std/assert';

import { refusedVersion, supportedOnly } from './app_version.ts';
import type { Client } from './supabase.ts';

type Answer = { data: boolean | null; error: { code: string; message: string } | null };

/** A database that answers app_version_supported() as given, and keeps what it was asked. */
function database(answer: Answer) {
  const asked: unknown[] = [];
  const supabase = {
    rpc: (name: string, args: unknown) => {
      asked.push([name, args]);
      return Promise.resolve(answer);
    },
  } as unknown as Client;
  return { supabase, asked };
}

const request = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/', { method: 'POST', headers });
const BUILD = { 'x-app-platform': 'ios', 'x-app-version': '1.3.9' };

Deno.test('refuses a build the database says is no longer supported', async () => {
  const { supabase, asked } = database({ data: false, error: null });
  const refusal = await refusedVersion(request(BUILD), supabase);
  assertEquals(refusal?.status, 426);
  assertEquals(await refusal?.json(), { error: 'unsupported_version' });
  assertEquals(asked, [['app_version_supported', { platform: 'ios', app_version: '1.3.9' }]]);
});

Deno.test('lets a supported build go on', async () => {
  const { supabase } = database({ data: true, error: null });
  assertEquals(await refusedVersion(request(BUILD), supabase), null);
});

Deno.test('lets a request that names no build go on, without asking', async () => {
  const { supabase, asked } = database({ data: false, error: null });
  assertEquals(await refusedVersion(request(), supabase), null);
  assertEquals(await refusedVersion(request({ 'x-app-version': '1.3.9' }), supabase), null);
  assertEquals(asked, []);
});

Deno.test('lets a request go on when the database cannot be asked', async () => {
  const { supabase } = database({ data: null, error: { code: '57014', message: 'timeout' } });
  assertEquals(await refusedVersion(request(BUILD), supabase), null);
});

Deno.test('runs the handler only for a supported build', async () => {
  let ran = 0;
  const handler = supportedOnly(() => {
    ran++;
    return new Response('done');
  });
  const refused = await handler(request(BUILD), database({ data: false, error: null }));
  assertEquals([refused.status, ran], [426, 0]);
  const passed = await handler(request(BUILD), database({ data: true, error: null }));
  assertEquals([await passed.text(), ran], ['done', 1]);
});
