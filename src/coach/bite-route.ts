// How Bite's chat is opened (#295, ADR 0055): on a saved thread, by its id, or on a new chat. The
// chat screen reads the same params, so that only this file knows them.
import { router } from 'expo-router';
import { useEffect } from 'react';

import { isRecent, type ThreadSummary, useLastThread } from './threads';

/**
 * The params of `/bite`: a saved thread, or a new chat with a key of its own, which may offer the
 * last chat to continue (`offer`, its id). `from` is `chats` for a chat opened over the chats,
 * which it goes back to.
 */
export type BiteParams = { thread?: string; fresh?: string; offer?: string; from?: 'chats' };

/** The params of `/bite/chats`: `current`, the id of the saved chat under them, if any. */
export type ChatsParams = { current?: string };

/** Opens the chats over the chat, naming its thread, `current`, if it has one. */
export function openChats(current?: number) {
  router.push({
    pathname: '/bite/chats',
    params: current === undefined ? {} : { current: String(current) },
  });
}

/**
 * Opens a chat from the chats: a thread of the history over them, to go back to them from it, or,
 * without one, a new chat in place of the one under them. The thread under them, `current`, is
 * gone back to rather than opened again, so that it is never open twice.
 */
export function openChat(thread?: number, current?: string) {
  if (thread === undefined) {
    // A new chat's key is new each time, so that it starts empty even over one that was open.
    router.dismissTo({
      pathname: '/bite',
      params: { thread: '', fresh: String(Date.now()), offer: '' },
    });
    return;
  }
  if (String(thread) === current) {
    router.back();
    return;
  }
  router.push({
    pathname: '/bite',
    params: { thread: String(thread), fresh: '', offer: '', from: 'chats' },
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
  /** Opened over the chats, which it goes back to, as on board 18. */
  fromChats: boolean;
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
    fromChats: params.from === 'chats',
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
