import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { deviceToday } from '@/i18n/dates';
import { Constants, type Database } from '@/lib/database.types';
import { oneOf } from '@/lib/one-of';
import { supabase } from '@/lib/supabase';

import { type BiteExpressionName, type ChatEvent, streamChat } from './chat-stream';

const ACCESS_KEY = ['ai', 'access'];

type AccessReason = Database['public']['Enums']['ai_access_reason'];

/** Every reason a message is refused, after which the function drops a thread it started for it. */
const ACCESS_REASONS = Constants.public.Enums.ai_access_reason;

/** Why the user may not chat with Bite at all now, as ai_access() says (ADR 0051). */
const REFUSALS = [
  'account_required',
  'plan_required',
  'limit_reached',
] as const satisfies readonly AccessReason[];
export type Refusal = (typeof REFUSALS)[number];

/** Why Bite gave no answer to one message; any other reason is said as unavailable. */
const FAILURES = [
  'unavailable',
  'blocked',
  'not_saved',
  'request_too_large',
  'call_in_progress',
] as const;
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
  /** A question Bite gave no answer to. */
  unanswered?: boolean;
  /** An answer that stopped short: stopped by the user, or cut off. */
  cut?: 'stopped' | 'cut_off';
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
  /**
   * How a message to Bite ended: an answer that stopped short says so; when nothing of it came,
   * it goes, and the question says it was not answered.
   */
  const settle = useCallback(
    (questionId: string, biteId: string, cut?: ChatMessage['cut']) =>
      setMessages((all) => {
        const bite = all.find((message) => message.id === biteId);
        if (bite?.text) {
          return cut ? all.map((m) => (m.id === biteId ? { ...m, cut } : m)) : all;
        }
        return all
          .filter((message) => message.id !== biteId)
          .map((m) => (m.id === questionId ? { ...m, unanswered: true } : m));
      }),
    [],
  );

  const run = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || abort.current) return;
      const biteId = `bite-${++count.current}`;
      const questionId = `user-${count.current}`;
      setMessages((all) => [
        ...all,
        { id: questionId, role: 'user', text: message },
        { id: biteId, role: 'bite', text: '' },
      ]);
      let cut: ChatMessage['cut'];
      // Whether the answer ended as the function ends it, with `done` or `error`.
      let ended = false;
      const threadBefore = threadId.current;
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
            threadId.current = event.threadId;
            return;
          case 'done':
            ended = true;
            threadId.current = event.threadId;
            if (event.interrupted) cut = 'cut_off';
            // What the model broke off can be asked again; a refusal shows once access is read.
            if (event.interrupted === 'failed') setFailure('unavailable');
            return;
          case 'error': {
            ended = true;
            // A refused message's new thread is gone again: the next one starts its own.
            if (oneOf(ACCESS_REASONS, event.reason)) threadId.current = threadBefore;
            const refusal = oneOf(REFUSALS, event.reason);
            if (refusal) setRefusal(refusal);
            else setFailure(oneOf(FAILURES, event.reason) ?? 'unavailable');
            // An answer that came whole but was not saved did not stop short.
            if (event.reason !== 'not_saved') cut = 'cut_off';
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
        // An answer that ends without its end, as when the connection closed, stopped short.
        if (!ended) {
          setFailure('unavailable');
          cut = 'cut_off';
        }
      } catch {
        // Stopped by the user, or no answer came: what came stays.
        if (controller.signal.aborted) cut = 'stopped';
        else {
          setFailure('unavailable');
          cut = 'cut_off';
        }
      } finally {
        abort.current = undefined;
        setStatus('idle');
        setTool(undefined);
        settle(questionId, biteId, cut);
        // What the message cost counts toward the month's budget.
        void queryClient.invalidateQueries({ queryKey: ACCESS_KEY });
      }
    },
    [i18n.language, queryClient, settle, updateBite],
  );

  /** Sends a message to Bite; its answer comes into the messages as it is written. */
  const send = useCallback((text: string) => void run(text), [run]);

  /** Stops Bite's answer; what came of it stays. */
  const stop = useCallback(() => abort.current?.abort(), []);

  /** Asks an unanswered question again: it moves down, to be answered there. */
  const askAgain = useCallback(
    (question: ChatMessage) => {
      if (abort.current) return;
      setMessages((all) => all.filter((message) => message.id !== question.id));
      send(question.text);
    },
    [send],
  );

  // After a failure, the last question is asked again: by Ask again under it when it got no
  // answer, or else by Try again, which keeps what came of the answer above.
  const last = messages.findLast((message) => message.role === 'user');
  const canRetry = status === 'idle' && !refusal && failure && last && !last.unanswered;
  const retry = useCallback(() => {
    if (last) send(last.text);
  }, [last, send]);

  return {
    messages,
    status,
    tool,
    failure,
    refusal,
    send,
    stop,
    askAgain,
    /** Tries the last question again, when that is what the failure offers. */
    retry: canRetry ? retry : undefined,
  };
}
