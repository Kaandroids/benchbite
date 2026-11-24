// A stand-in for the service role's client in the export's tests: the limit, the media to read,
// and the exports bucket, which keeps what is uploaded and signs links to it.
import type { Client } from './supabase.ts';

export function fakeExportAdmin({
  media = {},
  taken = true,
  uploadFails = false,
}: { media?: Record<string, string>; taken?: boolean; uploadFails?: boolean } = {}) {
  const uploaded: Record<string, Uint8Array> = {};
  const removed: string[] = [];
  const calls: string[] = [];
  const signed: { path: string; seconds: number; download: unknown }[] = [];
  const client = {
    rpc: (fn: string, args: Record<string, string>) => {
      calls.push(`${fn} ${args.p_user}`);
      return Promise.resolve({ data: taken, error: null });
    },
    storage: {
      from: (bucket: string) => ({
        download: (path: string) => {
          const body = media[`${bucket}:${path}`];
          return Promise.resolve(
            body === undefined
              ? { data: null, error: { message: 'Object not found' } }
              : { data: new Blob([body]), error: null },
          );
        },
        list: (folder: string) =>
          Promise.resolve({
            data: Object.keys(uploaded)
              .filter((path) => path.startsWith(`${folder}/`))
              .map((path) => ({ id: path, name: path.slice(folder.length + 1) })),
            error: null,
          }),
        remove: (paths: string[]) => {
          for (const path of paths) {
            removed.push(path);
            delete uploaded[path];
          }
          return Promise.resolve({ data: paths.map((name) => ({ name })), error: null });
        },
        upload: async (path: string, body: ReadableStream<Uint8Array>) => {
          if (uploadFails) return { data: null, error: { message: 'Payload too large' } };
          uploaded[path] = new Uint8Array(await new Response(body).arrayBuffer());
          return { data: { path }, error: null };
        },
        createSignedUrl: (path: string, seconds: number, options: { download: unknown }) => {
          signed.push({ path, seconds, download: options.download });
          return Promise.resolve({
            data: { signedUrl: `https://storage.test/${bucket}/${path}?token=t` },
            error: null,
          });
        },
      }),
    },
  } as unknown as Client;
  return { client, uploaded, removed, calls, signed };
}
