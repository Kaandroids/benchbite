// The language model as the Edge Functions see it (ADR 0049): our own messages, tools and events,
// which each provider translates, so that the provider can change in one place.

import type { Database } from '../database.types.ts';

/** A JSON Schema, as tools and structured output describe their data. */
export type JsonSchema = Record<string, unknown>;

/**
 * A part of a message. `signature` is the provider's opaque record of its reasoning, which it
 * needs back with the part on the next turn, as Gemini 3 does for its tool calls.
 */
export type Part =
  | { type: 'text'; text: string; signature?: string }
  /** Base64 data, sent in the request itself rather than uploaded. */
  | { type: 'image'; mimeType: string; data: string }
  | { type: 'audio'; mimeType: string; data: string }
  | {
      type: 'toolCall';
      /** The provider's id of the call, which its result names, where the provider has one. */
      id?: string;
      name: string;
      args: Record<string, unknown>;
      signature?: string;
    }
  | { type: 'toolResult'; id?: string; name: string; result: unknown };

export type Message = {
  /** The user, including the results of the tools the model called, or the model. */
  role: 'user' | 'model';
  parts: Part[];
};

/** A function the model may call, with its arguments as a JSON Schema. */
export type Tool = {
  name: string;
  description: string;
  parameters: JsonSchema;
};

/**
 * What a call is for: the feature its usage is recorded under (ADR 0051), each with its own model
 * and settings (`config.ts`).
 */
export type Task = Database['public']['Enums']['ai_feature'];

export type ModelRequest = {
  task: Task;
  /** The instructions the model follows, before the conversation. */
  system?: string;
  messages: Message[];
  tools?: Tool[];
  /** Asks for JSON in this shape instead of free text. */
  responseSchema?: JsonSchema;
  maxOutputTokens?: number;
};

/** What a call used, which the costs are worked out from (#288). */
export type Usage = {
  /** The model asked for, by which the call is priced. */
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Part of the output: what the model spent reasoning before it answered. */
  thinkingTokens: number;
  /** Part of the input: what the provider read from its cache, at a lower price. */
  cachedInputTokens: number;
};

/** Why the model stopped: it was done, it ran out of tokens, or it was blocked. */
export type Finish = 'stop' | 'length' | 'blocked' | 'other';

export type ModelResponse = {
  parts: Part[];
  usage: Usage;
  finish: Finish;
};

/** The parts a stream brings as they come. */
type StreamedPart = Extract<Part, { type: 'text' | 'toolCall' }>;

/** What a streamed answer brings, in order: text as it comes, tool calls, and the end. */
export type StreamEvent = StreamedPart | { type: 'done'; usage: Usage; finish: Finish };

/** A part as a stream brings it, or nothing for a part a stream leaves out. */
export function streamedPart(part: Part): StreamedPart | undefined {
  return part.type === 'text' || part.type === 'toolCall' ? part : undefined;
}

export interface LanguageModel {
  /** The whole answer at once. */
  generate(request: ModelRequest): Promise<ModelResponse>;
  /** The answer as it comes, ending with one `done` event. */
  stream(request: ModelRequest): AsyncIterable<StreamEvent>;
}

/**
 * A call the provider refused or failed; `retryable` for limits and passing outages. `usage` is
 * what a call that failed part-way had used, which is billed all the same.
 */
export class ModelError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly usage?: Usage,
  ) {
    super(message);
    this.name = 'ModelError';
  }
}
