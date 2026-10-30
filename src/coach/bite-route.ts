// How Bite's chat is opened (#295, ADR 0055): on a saved thread, by its id, or on a new chat. The
// chat screen reads the same params, so that only this file knows them.
import { router } from 'expo-router';
import { useEffect } from 'react';

import { isRecent, type ThreadSummary, useLastThread } from './threads';

/**
 * The params of `/bite`: a saved thread, or a new chat with a key of its own, which may offer the
 * last chat to continue (`offer`, its id).
 */
export type BiteParams = { thread?: string; fresh?: string; offer?: string };

/** Opens the chat under the chats: a thread of the history, or, without one, a new chat. */
export function openChat(thread?: number) {
  router.dismissTo({
    pathname: '/bite',
    // A new chat's key is new each time, so that it starts empty even over one that was open.
    params:
      thread === undefined
        ? { thread: '', fresh: String(Date.now()), offer: '' }
        : { thread: String(thread), fresh: '', offer: '' },
  });
}

/** Goes on in a saved thread from Bite's own screen, as from its Continue card. */
export function continueChat(thread: number) {
  router.setParams({ thread: String(thread), fresh: '', offer: '' });
}

/**
 * The chat the params open. Opened from the tab bar, Bite reads its last chat once and decides:
 * it goes on in it while it is recent, and starts a new chat offering it otherwise. The decision
 * goes into the params, so that a chat, once open, is never swapped for another, as when its own
 * first message makes it the last chat.
 */
export function useOpenedChat(params: BiteParams): {
  threadId?: number;
  key: string;
  /** Until the last chat is known, from the tab bar. */
  waiting: boolean;
  /** The last chat, no longer recent, which a new chat offers to continue. */
  offer?: ThreadSummary;
} {
  const asked = chatOf(params);
  const last = useLastThread(asked.latest);
  const decided = asked.latest && !last.isPending;
  const lastThread = last.data;
  useEffect(() => {
    if (!decided) return;
    router.setParams(
      lastThread && isRecent(lastThread, new Date())
        ? { thread: String(lastThread.id), fresh: '', offer: '' }
        : { thread: '', fresh: String(Date.now()), offer: lastThread ? String(lastThread.id) : '' },
    );
  }, [decided, lastThread]);
  return {
    threadId: asked.threadId,
    key: asked.key,
    waiting: asked.latest,
    offer:
      params.offer && lastThread && String(lastThread.id) === params.offer ? lastThread : undefined,
  };
}

/**
 * The saved thread the params name, if any, and a key for the chat they open; `latest` when they
 * name neither a thread nor a new chat, as from the tab bar, where Bite opens on its last chat
 * while it is recent (ADR 0055).
 */
export function chatOf({ thread, fresh }: BiteParams): {
  threadId?: number;
  key: string;
  latest: boolean;
} {
  const threadId = thread && /^\d+$/.test(thread) ? Number(thread) : undefined;
  return threadId === undefined
    ? { key: `new-${fresh ?? ''}`, latest: !fresh }
    : { threadId, key: `thread-${threadId}`, latest: false };
}
