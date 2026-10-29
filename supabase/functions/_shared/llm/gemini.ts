// Gemini behind our language model (ADR 0049), through the Gemini Developer API with an API key.
// The requests are plain REST, so that no SDK has to follow Deno.
import type { ModelConfig } from './config.ts';
import {
  type Finish,
  type LanguageModel,
  ModelError,
  type ModelRequest,
  type ModelResponse,
  type Part,
  type StreamEvent,
  streamedPart,
  type Task,
  type Usage,
} from './types.ts';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export type GeminiOptions = {
  apiKey: string;
  /** The model and settings of each task. */
  models: (task: Task) => ModelConfig;
  /** For tests. */
  fetch?: typeof fetch;
};

// The shapes of Gemini's REST API, as far as we use them.
type GeminiPart = {
  text?: string;
  /** A summary of the model's reasoning, which is not part of the answer. */
  thought?: boolean;
  thoughtSignature?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
};

type GeminiResponse = {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
  };
  /** An error the stream reports after it began, in place of an answer. */
  error?: { code?: number; message?: string };
};

export class GeminiModel implements LanguageModel {
  readonly #options: GeminiOptions;

  constructor(options: GeminiOptions) {
    this.#options = options;
  }

  model(task: Task): string {
    return this.#options.models(task).model;
  }

  async countTokens(request: ModelRequest): Promise<number> {
    const config = this.#options.models(request.task);
    // What it sends: the answer's settings are not counted.
    const { generationConfig: _, ...content } = toGeminiRequest(request, config);
    const response = await this.#post(config.model, 'countTokens', {
      generateContentRequest: { model: `models/${config.model}`, ...content },
    });
    const body = (await response.json()) as { totalTokens?: number };
    if (typeof body.totalTokens !== 'number') {
      throw new ModelError('Gemini: countTokens gave no count', 502, true, false);
    }
    return body.totalTokens;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const { model, response } = await this.#call(request, 'generateContent');
    let body: GeminiResponse;
    try {
      body = await response.json();
    } catch (error) {
      // As when the connection drops before the whole answer came; what it used is unknown.
      throw new ModelError(`Gemini: the answer broke off: ${messageOf(error)}`, 503, true, true);
    }
    return {
      parts: answerParts(body).map(fromGeminiPart),
      usage: usageOf(body, model),
      finish: finishOf(body),
    };
  }

  async *stream(request: ModelRequest): AsyncIterable<StreamEvent> {
    const { model, response } = await this.#call(request, 'streamGenerateContent?alt=sse');
    let last: GeminiResponse = {};
    let usage: GeminiResponse['usageMetadata'];
    const used = () => usageOf({ ...last, usageMetadata: usage }, model);
    const chunks = serverSentEvents(response.body!)[Symbol.asyncIterator]();
    try {
      while (true) {
        let next: IteratorResult<GeminiResponse>;
        try {
          next = await chunks.next();
        } catch (error) {
          throw new ModelError(
            `Gemini: the stream broke off: ${messageOf(error)}`,
            503,
            true,
            true,
          );
        }
        if (next.done) break;
        const chunk = next.value;
        if (chunk.error) {
          const status = chunk.error.code ?? 500;
          throw new ModelError(
            `Gemini: ${status} ${chunk.error.message}`,
            status,
            isRetryable(status),
            true,
          );
        }
        last = chunk;
        // Each chunk counts the whole call so far; the last one that counts is the total.
        usage = chunk.usageMetadata ?? usage;
        for (const part of answerParts(chunk)) {
          const event = streamedPart(fromGeminiPart(part));
          if (event) yield event;
        }
      }
    } finally {
      // Left before its end, the stream closes its connection, so that the request stops.
      await chunks.return?.();
    }
    yield {
      type: 'done',
      usage: used(),
      // Only the last chunk of a stream says why it ended: without it, the stream broke off.
      finish: finishOf(last, 'other'),
    };
  }

  async #call(request: ModelRequest, method: string) {
    const config = this.#options.models(request.task);
    const response = await this.#post(config.model, method, toGeminiRequest(request, config));
    return { model: config.model, response };
  }

  async #post(model: string, method: string, body: unknown): Promise<Response> {
    const response = await (this.#options.fetch ?? fetch)(`${BASE_URL}/models/${model}:${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': this.#options.apiKey },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await modelError(response);
    return response;
  }
}

/** Our request in Gemini's terms. */
function toGeminiRequest(request: ModelRequest, config: ModelConfig) {
  return {
    ...(request.system && { systemInstruction: { parts: [{ text: request.system }] } }),
    contents: request.messages.map((message) => ({
      role: message.role,
      parts: message.parts.map(toGeminiPart),
    })),
    ...(request.tools?.length && {
      tools: [
        {
          functionDeclarations: request.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parametersJsonSchema: tool.parameters,
          })),
        },
      ],
    }),
    generationConfig: {
      thinkingConfig: { thinkingLevel: config.thinking },
      ...(request.maxOutputTokens && { maxOutputTokens: request.maxOutputTokens }),
      ...(request.responseSchema && {
        responseMimeType: 'application/json',
        responseJsonSchema: request.responseSchema,
      }),
    },
  };
}

function toGeminiPart(part: Part): GeminiPart {
  switch (part.type) {
    case 'text':
      return { text: part.text, ...(part.signature && { thoughtSignature: part.signature }) };
    case 'image':
    case 'audio':
      return { inlineData: { mimeType: part.mimeType, data: part.data } };
    case 'toolCall':
      return {
        functionCall: { ...(part.id && { id: part.id }), name: part.name, args: part.args },
        ...(part.signature && { thoughtSignature: part.signature }),
      };
    case 'toolResult':
      return {
        functionResponse: {
          ...(part.id && { id: part.id }),
          name: part.name,
          // Gemini takes an object; anything else is wrapped in one.
          response: isObject(part.result) ? part.result : { result: part.result },
        },
      };
  }
}

function fromGeminiPart(part: GeminiPart): Part {
  const signature = part.thoughtSignature ? { signature: part.thoughtSignature } : {};
  if (part.functionCall) {
    const { id, name, args } = part.functionCall;
    return { type: 'toolCall', ...(id && { id }), name, args: args ?? {}, ...signature };
  }
  if (part.inlineData) {
    const { mimeType, data } = part.inlineData;
    return { type: mimeType.startsWith('audio/') ? 'audio' : 'image', mimeType, data };
  }
  return { type: 'text', text: part.text ?? '', ...signature };
}

/** The parts of the answer, without summaries of the model's reasoning. */
function answerParts(response: GeminiResponse): GeminiPart[] {
  return (response.candidates?.[0]?.content?.parts ?? []).filter((part) => !part.thought);
}

function usageOf(response: GeminiResponse, model: string): Usage {
  const usage = response.usageMetadata ?? {};
  const thinkingTokens = usage.thoughtsTokenCount ?? 0;
  return {
    // The model asked for, not the version Gemini says answered.
    model,
    inputTokens: usage.promptTokenCount ?? 0,
    // Gemini counts the reasoning apart from the answer, but bills both as output.
    outputTokens: (usage.candidatesTokenCount ?? 0) + thinkingTokens,
    thinkingTokens,
    cachedInputTokens: usage.cachedContentTokenCount ?? 0,
  };
}

/** Why the answer ended; `unsaid` when Gemini gives no reason. */
function finishOf(response: GeminiResponse, unsaid: Finish = 'stop'): Finish {
  if (response.promptFeedback?.blockReason) return 'blocked';
  switch (response.candidates?.[0]?.finishReason) {
    case undefined:
      return unsaid;
    case 'STOP':
      return 'stop';
    case 'MAX_TOKENS':
      return 'length';
    case 'SAFETY':
    case 'RECITATION':
    case 'BLOCKLIST':
    case 'PROHIBITED_CONTENT':
    case 'SPII':
    case 'IMAGE_SAFETY':
      return 'blocked';
    default:
      return 'other';
  }
}

/** The JSON of each event of a server-sent event stream, as `alt=sse` sends them. */
async function* serverSentEvents(body: ReadableStream<Uint8Array>): AsyncIterable<GeminiResponse> {
  let buffer = '';
  for await (const text of body.pipeThrough(new TextDecoderStream())) {
    // On the whole buffer, as a read can end between the two characters of a line break.
    buffer = (buffer + text).replaceAll('\r\n', '\n');
    let end;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = eventData(event);
      if (data) yield JSON.parse(data);
    }
  }
  // The last event, if the stream ended without a blank line after it.
  const data = eventData(buffer);
  if (data) yield JSON.parse(data);
}

function eventData(event: string): string {
  return event
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
}

async function modelError(response: Response): Promise<ModelError> {
  const body = await response.json().catch(() => undefined);
  const message = body?.error?.message ?? response.statusText;
  // Refused before answering, which Gemini does not bill.
  return new ModelError(
    `Gemini: ${response.status} ${message}`,
    response.status,
    isRetryable(response.status),
    false,
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Too many requests and passing outages are worth another try; a wrong request is not. */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
