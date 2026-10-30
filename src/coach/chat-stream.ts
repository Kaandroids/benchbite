import type { ChatRequest, ChatEvent as SharedChatEvent } from '@shared/coach/chat';

import { functionUrl, publishableKey, supabase } from '@/lib/supabase';

import type { AnswerExpression } from './bite-expressions';

/** What coach-chat tells the app as Bite answers, one server-sent event each (ADR 0052). */
export type ChatEvent = SharedChatEvent<AnswerExpression>;

export type { ChatRequest };

/**
 * Reads the server-sent events in `buffer` that are complete, and returns them with what is left
 * of the next one. An event Bite's function does not send is skipped.
 */
export function readEvents(buffer: string): { events: ChatEvent[]; rest: string } {
  const blocks = buffer.replaceAll('\r\n', '\n').split('\n\n');
  const rest = blocks.pop() ?? '';
  const events: ChatEvent[] = [];
  for (const block of blocks) {
    let name = '';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) name = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!name || !data) continue;
    try {
      events.push({ event: name, ...JSON.parse(data) } as ChatEvent);
    } catch {
      // A broken event is left out; the answer goes on.
    }
  }
  return { events, rest };
}

/** Why a message could not be sent at all: no answer came from coach-chat. */
export class ChatRequestError extends Error {
  constructor(readonly status: number) {
    super(`coach-chat answered ${status}`);
    this.name = 'ChatRequestError';
  }
}

/**
 * Sends a message to Bite and calls `onEvent` with each event as it comes, until the answer ends
 * or `signal` stops it. The global fetch is Expo's, which streams the response's body.
 */
export async function streamChat(
  request: ChatRequest,
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const response = await fetch(functionUrl('coach-chat'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: publishableKey,
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok || !response.body) throw new ChatRequestError(response.status);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = readEvents(buffer);
    buffer = rest;
    events.forEach(onEvent);
  }
  readEvents(`${buffer}\n\n`).events.forEach(onEvent);
}
