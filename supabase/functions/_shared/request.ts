// Reading a request's body within a limit, for functions that take large bodies, as photos.

/**
 * The body as text, read until it ends or passes `max` bytes, when reading stops and nothing is
 * given; an empty text for a body that cannot be read. A request may not say its length, or say
 * less than it sends, so the body is counted as it comes.
 */
export async function readBody(req: Request, max: number): Promise<string | undefined> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel().catch(() => {});
        return undefined;
      }
      chunks.push(value);
    }
  } catch {
    return '';
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

/** The JSON of a text, or null for text that is not JSON. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
