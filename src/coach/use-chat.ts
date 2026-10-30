import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ACCESS_KEY, type Refusal } from '@/ai/access';
import { deviceToday } from '@/i18n/dates';

import { afterEvent, afterStream, beginning, type Ending, type Failure } from './chat-ending';
import {
  type BiteExpressionName,
  type ChatEvent,
  ChatRequestError,
  streamChat,
} from './chat-stream';

export type ChatMessage = {
  id: string;
  role: 'user' | 'bite';
  text: string;
  /** The face Bite answers with, once it is known. */
  expression?: BiteExpressionName;
  /** A question Bite gave no answer to. */
  unanswered?: boolean;
  /** An answer that stopped short: stopped by the user, or cut off. */
  cut?: Ending['cut'];
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

  const updateBite = (id: string, update: (message: ChatMessage) => ChatMessage) =>
    setMessages((all) => all.map((message) => (message.id === id ? update(message) : message)));
  /**
   * How a message to Bite ended: an answer that stopped short says so; when nothing of it came,
   * it goes, and the question says it was not answered.
   */
  const settle = (questionId: string, biteId: string, cut?: ChatMessage['cut']) =>
    setMessages((all) => {
      const bite = all.find((message) => message.id === biteId);
      if (bite?.text) {
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
    setMessages((all) => [
      ...all,
      { id: questionId, role: 'user', text: message },
      { id: biteId, role: 'bite', text: '' },
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
      }
    };

    try {
      await streamChat(
        { message, threadId: threadId.current, language: i18n.language, today: deviceToday() },
        onEvent,
        controller.signal,
      );
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
      // What the message cost counts toward the month's budget.
      void queryClient.invalidateQueries({ queryKey: ACCESS_KEY });
    }
  };

  /** Sends a message to Bite; its answer comes into the messages as it is written. */
  const send = (text: string) => void run(text);

  /** Stops Bite's answer; what came of it stays. */
  const stop = () => abort.current?.abort();

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
