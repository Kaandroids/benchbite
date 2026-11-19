// Vertex AI as the place Gemini is called (ADR 0153): the hosted project's, under Google Cloud's
// data processing terms and in the EU. It takes the Developer API's requests at its own address,
// signed by a service account rather than an API key: the account's key signs a claim, which Google
// exchanges for an access token of an hour. Plain REST and Web Crypto, so that no SDK has to follow
// Deno.
import { fromBase64, toBase64Url } from '../base64_bytes.ts';
import { isObject } from '../json.ts';
import { type GeminiEndpoint, isRetryable, messageOf } from './gemini.ts';
import { ModelError } from './types.ts';

/**
 * The EU multi-region, which keeps the requests' processing in the EU. Not the environment's to
 * choose: the `global` location, which takes the same requests, promises no place at all.
 */
const LOCATION = 'eu';
const API = `https://aiplatform.${LOCATION}.rep.googleapis.com/v1`;

/** Google's token endpoint, never the one the key's file names, which could send the claim away. */
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
/** How long a claim asks its token to last, in seconds: the longest Google gives. */
const TOKEN_SECONDS = 3600;
/** A token is renewed this long before it ends, in seconds, so that no request carries one that
 * ends on its way. */
const RENEW_BEFORE_SECONDS = 300;
/** How long Google may take to give a token, in milliseconds: the requests of a worker wait for the
 * same one, so one that hangs would hold them all. */
const TOKEN_TIMEOUT_MS = 5000;

/** What a service account's key file says, as far as a token needs it. */
export type ServiceAccount = { projectId: string; clientEmail: string; privateKey: string };

/**
 * The service account of a key file, given as the file's JSON in base64, which an environment
 * variable holds without its line breaks and quotes getting in the way. What it throws never
 * tells the key.
 */
export function serviceAccount(encoded: string): ServiceAccount {
  let file: unknown;
  try {
    file = JSON.parse(new TextDecoder().decode(fromBase64(encoded.trim())));
  } catch {
    throw new Error('VERTEX_SERVICE_ACCOUNT is not the base64 of a key file');
  }
  if (
    !isObject(file) ||
    typeof file.project_id !== 'string' ||
    typeof file.client_email !== 'string' ||
    typeof file.private_key !== 'string'
  ) {
    throw new Error('VERTEX_SERVICE_ACCOUNT is not a service account key');
  }
  return {
    projectId: file.project_id,
    clientEmail: file.client_email,
    privateKey: file.private_key,
  };
}

export type VertexOptions = {
  /** For tests. */
  fetch?: typeof fetch;
  /** The time, in milliseconds; for tests. */
  now?: () => number;
};

type Token = { value: string; renewAt: number };

// Each request sets its model up anew, so the tokens are kept here, by account, for as long as the
// function's worker lives; a token asked for is shared by the requests that wait for it.
const tokens = new Map<string, Token>();
const asked = new Map<string, Promise<Token>>();

/** Forgets the tokens kept; for tests. */
export function forgetTokens() {
  tokens.clear();
  asked.clear();
}

/** Vertex AI in the EU, as `account`. */
export function vertexAi(account: ServiceAccount, options: VertexOptions = {}): GeminiEndpoint {
  const now = options.now ?? Date.now;
  const models = `${API}/projects/${account.projectId}/locations/${LOCATION}/publishers/google/models`;

  async function token(): Promise<string> {
    const kept = tokens.get(account.clientEmail);
    if (kept && now() < kept.renewAt) return kept.value;
    let asking = asked.get(account.clientEmail);
    if (!asking) {
      asking = askToken(account, now(), options.fetch ?? fetch).finally(() =>
        asked.delete(account.clientEmail),
      );
      asked.set(account.clientEmail, asking);
    }
    const fresh = await asking;
    tokens.set(account.clientEmail, fresh);
    return fresh.value;
  }

  return {
    url: (model, method) => `${models}/${model}:${method}`,
    headers: async () => ({ authorization: `Bearer ${await token()}` }),
    // Vertex AI counts the request itself, where the Developer API takes it wrapped, and refuses
    // one that says whether tools may be called. The tools are left out, and counted below.
    countBody: (_model, { tools: _tools, toolConfig: _toolConfig, ...counted }) => counted,
    uncounted: toolTokens,
  };
}

/**
 * How many characters of a tool's declaration, as JSON, make a token, at the least. Measured with
 * the chat's tools (ADR 0154): the calls were billed a token for each 4.2 to 4.7 characters.
 */
const TOOL_CHARACTERS_PER_TOKEN = 4;

/**
 * What a request's tools add to its input, at the most. Vertex AI's own count gives about a third
 * of what the call is then billed for them, so they are counted here by their size instead; a
 * request that forbids tool calls is not billed for them at all.
 */
function toolTokens(request: Record<string, unknown>): number {
  if (!request.tools || request.toolConfig) return 0;
  return Math.ceil(JSON.stringify(request.tools).length / TOOL_CHARACTERS_PER_TOKEN);
}

/** A token for the account, asked of Google with a claim its key signs. Nothing was billed. */
async function askToken(
  account: ServiceAccount,
  now: number,
  fetcher: typeof fetch,
): Promise<Token> {
  const seconds = Math.floor(now / 1000);
  let assertion: string;
  try {
    assertion = await signedClaim(account, seconds);
  } catch {
    // The key's own fault, which no other try mends; without the error, which may quote the key.
    throw new ModelError('Vertex AI: the service account key cannot sign', {
      status: 500,
      retryable: false,
      billed: false,
    });
  }
  let response: Response;
  try {
    response = await fetcher(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ModelError(`Vertex AI: no access token: ${messageOf(error)}`, {
      status: 503,
      retryable: true,
      billed: false,
    });
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok || !isObject(body) || typeof body.access_token !== 'string') {
    const reason = isObject(body) && typeof body.error === 'string' ? ` ${body.error}` : '';
    throw new ModelError(`Vertex AI: no access token: ${response.status}${reason}`, {
      status: response.ok ? 502 : response.status,
      // A refused claim, as of a deleted key, stays refused; limits and outages pass.
      retryable: response.ok || isRetryable(response.status),
      billed: false,
    });
  }
  const lasts = typeof body.expires_in === 'number' ? body.expires_in : TOKEN_SECONDS;
  return { value: body.access_token, renewAt: now + (lasts - RENEW_BEFORE_SECONDS) * 1000 };
}

/** The claim to be the account, as a JWT signed with its key (RS256). */
async function signedClaim(account: ServiceAccount, seconds: number): Promise<string> {
  const text = new TextEncoder();
  const header = toBase64Url(text.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = toBase64Url(
    text.encode(
      JSON.stringify({
        iss: account.clientEmail,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: seconds,
        exp: seconds + TOKEN_SECONDS,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    'pkcs8',
    // Copied, as the key is taken from a buffer of its own.
    new Uint8Array(fromBase64(account.privateKey.replace(/-----[A-Z ]+-----|\s/g, ''))),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    text.encode(`${header}.${claim}`),
  );
  return `${header}.${claim}.${toBase64Url(new Uint8Array(signature))}`;
}
