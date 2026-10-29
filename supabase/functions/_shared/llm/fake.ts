// A language model for tests, which answers from a script and keeps the requests it was sent, so
// that no test calls a real model (ADR 0049).
import {
  type LanguageModel,
  type ModelRequest,
  type ModelResponse,
  type StreamEvent,
  streamedPart,
  type Usage,
} from './types.ts';

/** A turn of the script: the response itself, or the parts of an answer that stopped. */
export type FakeTurn = ModelResponse | ModelResponse['parts'];

export const FAKE_USAGE: Usage = {
  model: 'fake',
  inputTokens: 10,
  outputTokens: 5,
  thinkingTokens: 0,
  cachedInputTokens: 0,
};

export class FakeModel implements LanguageModel {
  readonly requests: ModelRequest[] = [];
  readonly #turns: FakeTurn[];

  /** Each call takes the next turn of the script; a call after the last one throws. */
  constructor(...turns: FakeTurn[]) {
    this.#turns = turns;
  }

  generate(request: ModelRequest): Promise<ModelResponse> {
    return Promise.resolve(this.#next(request));
  }

  async *stream(request: ModelRequest): AsyncIterable<StreamEvent> {
    const { parts, usage, finish } = this.#next(request);
    for (const part of parts) {
      const event = streamedPart(part);
      if (event) yield event;
    }
    yield { type: 'done', usage, finish };
  }

  #next(request: ModelRequest): ModelResponse {
    this.requests.push(request);
    const turn = this.#turns.shift();
    if (!turn) throw new Error(`FakeModel: no turn left for request ${this.requests.length}`);
    const response: ModelResponse = Array.isArray(turn)
      ? { parts: turn, usage: FAKE_USAGE, finish: 'stop' }
      : turn;
    request.onUsage?.(response.usage);
    return response;
  }
}
