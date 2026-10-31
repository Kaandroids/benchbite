import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ACCESS_KEY, type Refusal } from '@/ai/access';
import { deviceToday } from '@/i18n/dates';

import type { AnswerExpression } from './bite-expressions';
import { afterEvent, afterStream, beginning, type Ending, type Failure } from './chat-ending';
import { type ChatEvent, ChatRequestError, streamChat } from './chat-stream';
import { isShownProposal, type ShownProposal } from './proposals';
import { THREADS_KEY } from './threads';

/** How soon after a stop a message refused as one at a time is sent again, and when. */
const RETRY_WITHIN_MS = 5_000;
const RETRY_AFTER_MS = 1_500;

/** Waits `ms`, or rejects when `signal` stops the wait. */
function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}

export type ChatMessage = {
  id: string;
  role: 'user' | 'bite';
  text: string;
  /** The face Bite answers with, once it is known. */
  expression?: AnswerExpression;
  /** A question Bite gave no answer to. */
  unanswered?: boolean;
  /** An answer that stopped short: stopped by the user, or cut off. */
  cut?: Ending['cut'];
  /** When it was written, which separates the days of a conversation. */
  createdAt?: Date;
  /** The changes Bite proposed with it (ADR 0058). */
  proposals?: ShownProposal[];
};

/** Waiting for Bite to start answering, or reading its answer as it comes. */
export type ChatStatus = 'idle' | 'thinking' | 'answering';

/**
 * A conversation with Bite, as it is on the screen: the messages, what Bite is doing, the tool it
 * is looking something up with, and why a message failed. It goes on in `start`'s thread, with
 * its messages, when one is given, or else in a new thread, until the screen closes.
 */
export function useChat(start?: { threadId: number; messages: ChatMessage[] }) {
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>(start?.messages ?? []);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [tool, setTool] = useState<string>();
  const [failure, setFailure] = useState<Failure>();
  const [refusal, setRefusal] = useState<Refusal>();
  const threadId = useRef<number | undefined>(start?.threadId);
  const abort = useRef<AbortController | undefined>(undefined);
  /** When the user last stopped an answer. */
  const stoppedAt = useRef(0);
  const count = useRef(0);

  // A message still on its way when the screen closes is stopped.
  useEffect(() => () => abort.current?.abort(), []);

  const updateBite = (id: string, update: (message: ChatMessage) => ChatMessage) =>
    setMessages((all) => all.map((message) => (message.id === id ? update(message) : message)));
  /**
   * How a message to Bite ended: an answer that stopped short says so; when nothing of it came,
   * it goes, and the question says it was not answered.
   */
  const settle = (questionId: string, biteId: string, cut?: ChatMessage['cut']) =>
    setMessages((all) => {
      const bite = all.find((message) => message.id === biteId);
      // A proposal's card is an answer, though Bite said nothing with it.
      if (bite?.text || bite?.proposals?.length) {
        return cut ? all.map((m) => (m.id === biteId ? { ...m, cut } : m)) : all;
      }
      return all
        .filter((message) => message.id !== biteId)
        .map((m) => (m.id === questionId ? { ...m, unanswered: true } : m));
    });

  /** Shows how a message ended, and keeps the thread the next one goes on in. */
  const finish = (ending: Ending, questionId: string, biteId: string) => {
    threadId.current = ending.threadId;
    setStatus('idle');
    setTool(undefined);
    if (ending.failure) setFailure(ending.failure);
    if (ending.refusal) setRefusal(ending.refusal);
    settle(questionId, biteId, ending.cut);
  };

  const run = async (text: string) => {
    const message = text.trim();
    if (!message || abort.current) return;
    const biteId = `bite-${++count.current}`;
    const questionId = `user-${count.current}`;
    const now = new Date();
    setMessages((all) => [
      ...all,
      { id: questionId, role: 'user', text: message, createdAt: now },
      { id: biteId, role: 'bite', text: '', createdAt: now },
    ]);
    let ending = beginning(threadId.current);
    setStatus('thinking');
    setFailure(undefined);
    const controller = new AbortController();
    abort.current = controller;

    const onEvent = (event: ChatEvent) => {
      ending = afterEvent(ending, event);
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
        case 'proposal': {
          const { proposal } = event;
          // One of a kind the chat has no card for yet waits in the message (ADR 0068).
          if (!isShownProposal(proposal)) return;
          return updateBite(biteId, (m) => ({
            ...m,
            proposals: [...(m.proposals ?? []), proposal],
          }));
        }
      }
    };

    try {
      const request = {
        message,
        threadId: threadId.current,
        language: i18n.language,
        today: deviceToday(),
      };
      await streamChat(request, onEvent, controller.signal);
      // The answer just stopped may hold the user's place a moment longer, until the server sees
      // its stop (ADR 0057): the message is sent once more, after it.
      if (
        ending.failure === 'call_in_progress' &&
        !ending.said &&
        Date.now() - stoppedAt.current < RETRY_WITHIN_MS
      ) {
        ending = beginning(threadId.current);
        await pause(RETRY_AFTER_MS, controller.signal);
        await streamChat(request, onEvent, controller.signal);
      }
      ending = afterStream(ending, 'closed');
    } catch (error) {
      // Stopped by the user, or no answer came: what came stays.
      ending = controller.signal.aborted
        ? afterStream(ending, 'stopped')
        : afterStream(
            ending,
            'failed',
            error instanceof ChatRequestError ? error.status : undefined,
          );
    } finally {
      abort.current = undefined;
      finish(ending, questionId, biteId);
      // What the message cost counts toward the month's budget, and the thread moves up the history.
      void queryClient.invalidateQueries({ queryKey: ACCESS_KEY });
      void queryClient.invalidateQueries({ queryKey: THREADS_KEY });
    }
  };

  /** Sends a message to Bite; its answer comes into the messages as it is written. */
  const send = (text: string) => void run(text);

  /** Stops Bite's answer; what came of it stays. */
  const stop = () => {
    if (!abort.current) return;
    stoppedAt.current = Date.now();
    abort.current.abort();
  };

  /** Asks an unanswered question again: it moves down, to be answered there. */
  const askAgain = (question: ChatMessage) => {
    if (abort.current) return;
    setMessages((all) => all.filter((message) => message.id !== question.id));
    send(question.text);
  };

  // After a failure, the last question is asked again: by Ask again under it when it got no
  // answer, or else by Try again, which keeps what came of the answer above.
  const last = messages.findLast((message) => message.role === 'user');
  const canRetry = status === 'idle' && !refusal && failure && last && !last.unanswered;
  const retry = () => {
    if (last) send(last.text);
  };

  return {
    messages,
    /** The thread the chat goes on in, once it has one. */
    thread: () => threadId.current,
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
