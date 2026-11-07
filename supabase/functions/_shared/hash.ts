// Hashing for Postgres, as for the tokens and addresses of ADR 0094.

/** The SHA-256 of a text, as Postgres takes a bytea: `\\x` and hex. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return `\\x${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
