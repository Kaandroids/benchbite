import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { deviceToday } from '@/i18n/dates';
import type { Database } from '@/lib/database.types';
import { oneOf } from '@/lib/one-of';
import { supabase } from '@/lib/supabase';

import { type BiteExpressionName, type ChatEvent, streamChat } from './chat-stream';

const ACCESS_KEY = ['ai', 'access'];

type AccessReason = Database['public']['Enums']['ai_access_reason'];

/** Why the user may not chat with Bite at all now, as ai_access() says (ADR 0051). */
const REFUSALS = [
  'account_required',
  'plan_required',
  'limit_reached',
] as const satisfies readonly AccessReason[];
export type Refusal = (typeof REFUSALS)[number];

/** Why Bite gave no answer to one message; any other reason is said as unavailable. */
const FAILURES = ['unavailable', 'blocked', 'not_saved', 'request_too_large'] as const;
export type Failure = (typeof FAILURES)[number];

/** Whether the user may chat with Bite this month, and when the month's budget resets. */
export function useAiAccess() {
  return useQuery({
    queryKey: ACCESS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ai_access');
      if (error) {
        throw error;
      }
      return {
        refusal: oneOf(REFUSALS, data.reason ?? undefined),
        resetsAt: data.resets_at ? new Date(data.resets_at) : undefined,
      };
    },
  });
}

export type ChatMessage = {
  id: string;
  role: 'user' | 'bite';
  text: string;
  /** The face Bite answers with, once it is known. */
  expression?: BiteExpressionName;
};

/** Waiting for Bite to start answering, or reading its answer as it comes. */
export type ChatStatus = 'idle' | 'thinking' | 'answering';

/**
 * A conversation with Bite, as it is on the screen: the messages, what Bite is doing, the tool it
 * is looking something up with, and why a message failed. The thread goes on until the screen
 * closes.
 */
export function useChat() {
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [tool, setTool] = useState<string>();
  const [failure, setFailure] = useState<Failure>();
  const [refusal, setRefusal] = useState<Refusal>();
  const threadId = useRef<number | undefined>(undefined);
  const abort = useRef<AbortController | undefined>(undefined);
  const count = useRef(0);

  // A message still on its way when the screen closes is stopped.
  useEffect(() => () => abort.current?.abort(), []);

  const updateBite = useCallback(
    (id: string, update: (message: ChatMessage) => ChatMessage) =>
      setMessages((all) => all.map((message) => (message.id === id ? update(message) : message))),
    [],
  );
  /** Bite's message goes when nothing of it came. */
  const dropIfEmpty = useCallback(
    (id: string) =>
      setMessages((all) => all.filter((message) => message.id !== id || message.text !== '')),
    [],
  );

  const run = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || abort.current) return;
      const biteId = `bite-${++count.current}`;
      setMessages((all) => [
        ...all,
        { id: `user-${count.current}`, role: 'user', text: message },
        { id: biteId, role: 'bite', text: '' },
      ]);
      setStatus('thinking');
      setFailure(undefined);
      const controller = new AbortController();
      abort.current = controller;

      const onEvent = (event: ChatEvent) => {
        switch (event.event) {
          case 'expression':
            return updateBite(biteId, (m) => ({ ...m, expression: event.expression }));
          case 'tool_start':
            return setTool(event.name);
          case 'tool_end':
            return setTool(undefined);
          case 'text':
            setStatus('answering');
            return updateBite(biteId, (m) => ({ ...m, text: m.text + event.text }));
          case 'thread':
          case 'done':
            threadId.current = event.threadId;
            return;
          case 'error': {
            const refusal = oneOf(REFUSALS, event.reason);
            if (refusal) setRefusal(refusal);
            else setFailure(oneOf(FAILURES, event.reason) ?? 'unavailable');
            return;
          }
        }
      };

      try {
        await streamChat(
          {
            message,
            threadId: threadId.current,
            language: i18n.language,
            today: deviceToday(),
          },
          onEvent,
          controller.signal,
        );
      } catch {
        // Stopped by the user, or no answer came: what came stays.
        if (!controller.signal.aborted) setFailure('unavailable');
      } finally {
        abort.current = undefined;
        setStatus('idle');
        setTool(undefined);
        dropIfEmpty(biteId);
        // What the message cost counts toward the month's budget.
        void queryClient.invalidateQueries({ queryKey: ACCESS_KEY });
      }
    },
    [dropIfEmpty, i18n.language, queryClient, updateBite],
  );

  /** Sends a message to Bite; its answer comes into the messages as it is written. */
  const send = useCallback((text: string) => void run(text), [run]);

  /** Stops Bite's answer; what came of it stays. */
  const stop = useCallback(() => abort.current?.abort(), []);

  return { messages, status, tool, failure, refusal, send, stop };
}
