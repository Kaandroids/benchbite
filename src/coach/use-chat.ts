import { PHOTO_REFUSALS, type ProposalCard } from '@shared/coach/chat';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ACCESS_KEY, type Refusal } from '@/ai/access';
import { deviceToday } from '@/i18n/dates';
import { oneOf } from '@/lib/one-of';

import type { AnswerExpression } from './bite-expressions';
import { afterEvent, afterStream, beginning, type Ending, type Failure } from './chat-ending';
import { localTime, type MessagePhoto, type PhotosProblem, photosToSend } from './chat-photos';
import { type ChatEvent, ChatRequestError, streamChat } from './chat-stream';
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
  /** The user's photos, shown above the text. */
  photos?: MessagePhoto[];
  /** The face Bite answers with, once it is known. */
  expression?: AnswerExpression;
  /** A question Bite gave no answer to. */
  unanswered?: boolean;
  /** An answer that stopped short: stopped by the user, or cut off. */
  cut?: Ending['cut'];
  /** When it was written, which separates the days of a conversation. */
  createdAt?: Date;
  /** The changes Bite proposed with it (ADR 0058). */
  proposals?: ProposalCard[];
};

/** What the user writes to Bite: text, photos as base64 JPEG ready to send, or both. */
export type Draft = { text: string; photos: string[] };

/**
 * A message handed back, refused, put back before what the user wrote since it was sent: its text
 * first, then its photos, all of them, though together they may be more than a message takes.
 */
export function withRefused(current: Draft, refused: Draft): Draft {
  return {
    text: [refused.text, current.text].filter((text) => text.trim()).join('\n'),
    photos: [...refused.photos, ...current.photos],
  };
}

/**
 * Whether a message can be sent again as it was: its photos are sent with their data, which only
 * the photos sent since the chat opened have on the device.
 */
export function canSendAgain(message: ChatMessage): boolean {
  return !message.photos?.some((photo) => photo.data === undefined);
}

/**
 * Why coach-chat refused a message's photos, if that is why it failed: by what it said, or by its
 * status alone for a body too large, which may be refused before the function reads it.
 */
function photosRefusal(error: unknown): PhotosProblem | undefined {
  if (!(error instanceof ChatRequestError)) return undefined;
  const reason =
    oneOf(PHOTO_REFUSALS, error.refusal) ?? (error.status === 413 ? 'photos_too_large' : undefined);
  if (!reason) return undefined;
  return error.photo === undefined ? { reason } : { reason, photo: error.photo };
}

/** Waiting for Bite to start answering, or reading its answer as it comes. */
export type ChatStatus = 'idle' | 'thinking' | 'answering';

/**
 * A conversation with Bite, as it is on the screen: the messages, what Bite is doing, the tool it
 * is looking something up with, and why a message failed. It goes on in `start`'s thread, with
 * its messages, when one is given, or else in a new thread, until the screen closes.
 *
 * A message whose photos are refused, by the app or by coach-chat before Bite is asked, leaves the
 * chat again: `onRefused` gets it back, with why, for the user to change it and send it again.
 */
export function useChat(
  start?: { threadId: number; messages: ChatMessage[] },
  onRefused?: (draft: Draft, problem: PhotosProblem) => void,
) {
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

  const run = async ({ text, photos }: Draft) => {
    const message = text.trim();
    if ((!message && photos.length === 0) || abort.current) return;
    const sent = photosToSend(photos);
    if (!Array.isArray(sent)) {
      onRefused?.({ text, photos }, sent);
      return;
    }
    const biteId = `bite-${++count.current}`;
    const questionId = `user-${count.current}`;
    const now = new Date();
    setMessages((all) => [
      ...all,
      {
        id: questionId,
        role: 'user',
        text: message,
        createdAt: now,
        ...(photos.length > 0 && { photos: photos.map((data) => ({ data })) }),
      },
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
        case 'proposal':
          return updateBite(biteId, (m) => ({
            ...m,
            proposals: [...(m.proposals ?? []), event.proposal],
          }));
      }
    };

    try {
      const request = {
        ...(message && { message }),
        ...(sent.length > 0 && { photos: sent }),
        threadId: threadId.current,
        language: i18n.language,
        today: deviceToday(),
        localTime: localTime(),
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
      const refused = photosRefusal(error);
      if (refused && !controller.signal.aborted) {
        // Refused before Bite was asked: the message goes back to the user, to change.
        setMessages((all) => all.filter((m) => m.id !== questionId && m.id !== biteId));
        onRefused?.({ text, photos }, refused);
        ending = { ...ending, ended: true };
        return;
      }
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

  /** Sends a message to Bite, text, photos or both; its answer comes in as it is written. */
  const send = (text: string, photos: string[] = []) => void run({ text, photos });

  /** Sends a message again as it was, with its photos. */
  const sendAgain = (message: ChatMessage) =>
    send(
      message.text,
      (message.photos ?? []).flatMap((photo) => (photo.data === undefined ? [] : [photo.data])),
    );

  /** Stops Bite's answer; what came of it stays. */
  const stop = () => {
    if (!abort.current) return;
    stoppedAt.current = Date.now();
    abort.current.abort();
  };

  /** Asks an unanswered question again: it moves down, to be answered there. */
  const askAgain = (question: ChatMessage) => {
    if (abort.current || !canSendAgain(question)) return;
    setMessages((all) => all.filter((message) => message.id !== question.id));
    sendAgain(question);
  };

  // After a failure, the last question is asked again: by Ask again under it when it got no
  // answer, or else by Try again, which keeps what came of the answer above.
  const last = messages.findLast((message) => message.role === 'user');
  const canRetry =
    status === 'idle' && !refusal && failure && last && !last.unanswered && canSendAgain(last);
  const retry = () => {
    if (last) sendAgain(last);
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
