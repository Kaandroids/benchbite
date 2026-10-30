// How Bite's chat is opened (#295): on a saved thread, by its id, or on a new chat. The chat
// screen reads the same params, so that only this file knows them.
import { router } from 'expo-router';

/** The params of `/bite`: a saved thread, or a new chat with a key of its own. */
export type BiteParams = { thread?: string; fresh?: string };

/** Opens the chat under the chats: a thread of the history, or, without one, a new chat. */
export function openChat(thread?: number) {
  router.dismissTo({
    pathname: '/bite',
    // A new chat's key is new each time, so that it starts empty even over one that was open.
    params:
      thread === undefined
        ? { thread: '', fresh: String(Date.now()) }
        : { thread: String(thread), fresh: '' },
  });
}

/** The saved thread the params name, if any, and a key for the chat they open. */
export function chatOf({ thread, fresh }: BiteParams): { threadId?: number; key: string } {
  const threadId = thread && /^\d+$/.test(thread) ? Number(thread) : undefined;
  return threadId === undefined
    ? { key: `new-${fresh ?? ''}` }
    : { threadId, key: `thread-${threadId}` };
}
