// How a message to Bite ends, read from coach-chat's events and from how its stream ended
// (ADR 0052), apart from the screen, so that every way it can end is tested on its own.
import type { ChatReason } from '@shared/coach/chat';

import { REFUSALS, type Refusal } from '@/ai/access';
import { oneOf } from '@/lib/one-of';

import type { ChatEvent } from './chat-stream';

/** Why Bite gave no answer to one message, as the app says it; any other reason is unavailable. */
const FAILURES = [
  'unavailable',
  'blocked',
  'not_saved',
  'request_too_large',
  'call_in_progress',
] as const satisfies readonly ChatReason[];
export type Failure = (typeof FAILURES)[number];

export type Ending = {
  /** The thread the next message goes on in; none for a new one. */
  threadId?: number;
  /** The thread before this message, which a dropped new thread gives way to. */
  before?: number;
  /** Whether any of the answer came. */
  said: boolean;
  /** Whether the function ended the answer, with `done` or `error`. */
  ended: boolean;
  /** An answer that stopped short: stopped by the user, or cut off. */
  cut?: 'stopped' | 'cut_off';
  failure?: Failure;
  refusal?: Refusal;
};

/** A message sent in `threadId`, before anything of its answer came. */
export function beginning(threadId: number | undefined): Ending {
  return { threadId, before: threadId, said: false, ended: false };
}

/** The ending after one more event of the answer. */
export function afterEvent(ending: Ending, event: ChatEvent): Ending {
  switch (event.event) {
    case 'thread':
      return { ...ending, threadId: event.threadId };
    case 'text':
      return { ...ending, said: true };
    case 'done':
      return explained(
        { ...ending, ended: true, threadId: event.threadId, cut: event.interrupted && 'cut_off' },
        event.reason,
      );
    case 'error':
      return explained(
        {
          ...ending,
          ended: true,
          // A new thread the function dropped again: the next message starts its own.
          threadId: event.dropped ? ending.before : ending.threadId,
          // An answer that came whole but was not saved did not stop short.
          cut: event.reason === 'not_saved' ? undefined : 'cut_off',
        },
        event.reason,
      );
    default:
      return ending;
  }
}

/**
 * The ending once the stream is over: it closed, the user stopped it, or it failed, with the
 * status the function answered with, if it did.
 */
export function afterStream(
  ending: Ending,
  how: 'closed' | 'stopped' | 'failed',
  status?: number,
): Ending {
  if (how === 'stopped') {
    if (ending.ended) return ending;
    // Stopped before Bite said anything, the function may drop a thread it began, without a word
    // to the app: the next message starts its own.
    return { ...ending, cut: 'stopped', threadId: ending.said ? ending.threadId : ending.before };
  }
  // An answer that ends without its end, as when the connection closed, stopped short.
  if (how === 'closed') {
    return ending.ended ? ending : { ...ending, cut: 'cut_off', failure: 'unavailable' };
  }
  return {
    ...ending,
    cut: 'cut_off',
    failure: 'unavailable',
    // A thread that is gone is left: the next message starts a new one.
    threadId: status === 404 ? undefined : ending.threadId,
  };
}

/** Says why the user may not go on, or why Bite could not answer. */
function explained(ending: Ending, reason: ChatReason | undefined): Ending {
  if (!reason) return ending;
  // A thread too long to go on with: the next message starts a new one, as the failure says.
  const threadId = reason === 'request_too_large' ? undefined : ending.threadId;
  const refusal = oneOf(REFUSALS, reason);
  if (refusal) return { ...ending, threadId, refusal };
  return { ...ending, threadId, failure: oneOf(FAILURES, reason) ?? 'unavailable' };
}
