import { PHOTO_REFUSALS, VOICE_REFUSALS } from '@shared/coach/chat';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ACCESS_KEY, type Refusal } from '@/ai/access';
import { deviceToday } from '@/i18n/dates';
import { oneOf } from '@/lib/one-of';

import type { AnswerExpression } from './bite-expressions';
import { afterEvent, afterStream, beginning, type Ending, type Failure } from './chat-ending';
import { localTime, type MessagePhoto, type PhotosProblem, photosToSend } from './chat-photos';
import { type ChatEvent, ChatRequestError, streamChat } from './chat-stream';
import {
  discardVoices,
  type MessageVoice,
  sweepVoices,
  type VoiceDraft,
  type VoiceProblem,
} from './chat-voice';
import type { MealCard } from './meal-cards';
import type { NoteCard } from './notes';
import { isShownProposal, type ShownProposal } from './proposals';
import { NOTES_KEY } from './notebook';
import { mediaPaths } from './chat-media';
import { messagePage, type OlderMessages, THREADS_KEY } from './threads';

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
  /** The user's voice message, with what was said in it as the text, once written down. */
  voice?: MessageVoice;
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
  /** The meals Bite estimated with it, for the user to add (ADR 0066). */
  mealCards?: MealCard[];
  /** The notes Bite kept with it (ADR 0071). */
  notes?: NoteCard[];
};

/** What the user writes to Bite: text, photos as base64 JPEG ready to send, or both. */
export type Draft = { text: string; photos: string[] };

/** What the user sends Bite: what they wrote, or a voice message, which goes alone. */
export type Outgoing = Draft | { voice: VoiceDraft };

/** Nothing written, as a voice message refused hands back. */
const NOTHING_WRITTEN: Draft = { text: '', photos: [] };

/** Why a message was refused before Bite was asked: its photos, or its voice message. */
export type DraftProblem = PhotosProblem | VoiceProblem;

/**
 * Whether a message can be sent again as it was: its photos and voice message are sent with their
 * data, which only those sent since the chat opened have on the device.
 */
export function canSendAgain(message: ChatMessage): boolean {
  return (
    !message.photos?.some((photo) => photo.data === undefined) &&
    (!message.voice || message.voice.data !== undefined)
  );
}

/**
 * Why coach-chat refused a message's photos or voice message, if that is why it failed: by what it
 * said, or by its status alone for a body too large, which may be refused before the function
 * reads it, as what the message held.
 */
function draftRefusal(error: unknown, voice: boolean): DraftProblem | undefined {
  if (!(error instanceof ChatRequestError)) return undefined;
  const tooLarge = error.status === 413;
  if (voice) {
    const reason =
      oneOf(VOICE_REFUSALS, error.refusal) ?? (tooLarge ? 'voice_too_large' : undefined);
    return reason ? { reason } : undefined;
  }
  const reason =
    oneOf(PHOTO_REFUSALS, error.refusal) ?? (tooLarge ? 'photos_too_large' : undefined);
  if (!reason) return undefined;
  return error.photo === undefined ? { reason } : { reason, photo: error.photo };
}

/** Waiting for Bite to start answering, or reading its answer as it comes. */
export type ChatStatus = 'idle' | 'thinking' | 'answering';

/**
 * A conversation with Bite, as it is on the screen: the messages, what Bite is doing, the tool it
 * is looking something up with, and why a message failed. It goes on in `start`'s thread, with
 * its latest messages, when one is given, or else in a new thread, until the screen closes; its
 * older messages are read a page at a time, as `start.older` begins them (#544).
 *
 * A message whose photos or voice message are refused, by the app or by coach-chat before Bite is
 * asked, leaves the chat again: `onRefused` gets it back, with why, for the user to change it and
 * send it again; a voice message refused comes back without it, to record again.
 */
export function useChat(
  start?: { threadId: number; messages: ChatMessage[]; older?: OlderMessages },
  onRefused?: (draft: Draft, problem: DraftProblem) => void,
) {
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>(start?.messages ?? []);
  // Where the messages not read yet begin, and whether a page of them is being read or failed.
  const [older, setOlder] = useState(start?.older);
  const [olderStatus, setOlderStatus] = useState<'idle' | 'loading' | 'failed'>('idle');
  // The photos and voice messages of each page of older messages read, for their addresses.
  const [olderMedia, setOlderMedia] = useState<string[][]>([]);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [tool, setTool] = useState<string>();
  const [failure, setFailure] = useState<Failure>();
  const [refusal, setRefusal] = useState<Refusal>();
  const threadId = useRef<number | undefined>(start?.threadId);
  // The same each render, for callbacks that depend on it.
  const thread = useCallback(() => threadId.current, []);
  const abort = useRef<AbortController | undefined>(undefined);
  /** When the user last stopped an answer. */
  const stoppedAt = useRef(0);
  const count = useRef(0);

  /** The voice messages recorded in this chat, whose files go when it closes. */
  const recorded = useRef<string[]>([]);

  // Recordings an earlier run left go as Bite opens; a message still on its way when the screen
  // closes is stopped, and the recordings of this chat go.
  useEffect(() => {
    sweepVoices();
    const recordings = recorded.current;
    return () => {
      abort.current?.abort();
      discardVoices(recordings);
    };
  }, []);

  const updateMessage = (id: string, update: (message: ChatMessage) => ChatMessage) =>
    setMessages((all) => all.map((message) => (message.id === id ? update(message) : message)));
  /**
   * How a message to Bite ended: an answer that stopped short says so; when nothing of it came,
   * it goes, and the question says it was not answered.
   */
  const settle = (questionId: string, biteId: string, cut?: ChatMessage['cut']) =>
    setMessages((all) => {
      const bite = all.find((message) => message.id === biteId);
      // A proposal's or a meal's card, or a note, is an answer, though Bite said nothing with it.
      if (bite?.text || bite?.proposals?.length || bite?.mealCards?.length || bite?.notes?.length) {
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

  const run = async (outgoing: Outgoing) => {
    const voice = 'voice' in outgoing ? outgoing.voice : undefined;
    const { text, photos } = 'voice' in outgoing ? NOTHING_WRITTEN : outgoing;
    const message = text.trim();
    if ((!message && photos.length === 0 && !voice) || abort.current) return;
    const sent = photosToSend(photos);
    if (!Array.isArray(sent)) {
      onRefused?.({ text, photos }, sent);
      return;
    }
    if (voice && !recorded.current.includes(voice.uri)) recorded.current.push(voice.uri);
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
        ...(sent.length > 0 && { photos: photos.map((data) => ({ data })) }),
        ...(voice && { voice }),
      },
      { id: biteId, role: 'bite', text: '', createdAt: now },
    ]);
    let ending = beginning(threadId.current);
    // Whether Bite kept a note in its answer, which the notebook then loads again.
    let keptNote = false;
    setStatus('thinking');
    setFailure(undefined);
    const controller = new AbortController();
    abort.current = controller;

    const onEvent = (event: ChatEvent) => {
      ending = afterEvent(ending, event);
      switch (event.event) {
        case 'expression':
          return updateMessage(biteId, (m) => ({ ...m, expression: event.expression }));
        case 'tool_start':
          return setTool(event.name);
        case 'tool_end':
          return setTool(undefined);
        case 'transcript':
          // What was said in the voice message, as Bite's function wrote it down.
          return updateMessage(questionId, (m) => ({ ...m, text: event.text }));
        case 'text':
          setStatus('answering');
          return updateMessage(biteId, (m) => ({ ...m, text: m.text + event.text }));
        case 'proposal': {
          const { proposal } = event;
          // One of a kind the chat has no card for stays out of it.
          if (!isShownProposal(proposal)) return;
          return updateMessage(biteId, (m) => ({
            ...m,
            proposals: [...(m.proposals ?? []), proposal],
          }));
        }
        case 'meal_card': {
          const { mealCard } = event;
          return updateMessage(biteId, (m) => ({
            ...m,
            mealCards: [...(m.mealCards ?? []), mealCard],
          }));
        }
        case 'note': {
          const { note } = event;
          keptNote = true;
          return updateMessage(biteId, (m) => ({ ...m, notes: [...(m.notes ?? []), note] }));
        }
      }
    };

    try {
      const request = {
        ...(message && { message }),
        ...(sent.length > 0 && { photos: sent }),
        ...(voice && { voice: { mimeType: 'audio/mp4' as const, data: voice.data } }),
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
      const refused = draftRefusal(error, !!voice);
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
      if (keptNote) void queryClient.invalidateQueries({ queryKey: NOTES_KEY });
    }
  };

  /** Sends a message to Bite, text, photos or both; its answer comes in as it is written. */
  const send = (text: string, photos: string[] = []) => void run({ text, photos });

  /** Sends a voice message to Bite, alone. */
  const sendVoice = (voice: VoiceDraft) => void run({ voice });

  /** Sends a message again as it was, with its photos or its voice message. */
  const sendAgain = ({ voice, ...message }: ChatMessage) =>
    voice?.data !== undefined
      ? sendVoice({ data: voice.data, uri: voice.uri, durationMs: voice.durationMs })
      : send(
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

  /** Reads the page of messages before those shown, once, and puts it before them. */
  const loadOlder = useCallback(async () => {
    if (!older || olderStatus === 'loading') return;
    setOlderStatus('loading');
    try {
      const page = await messagePage(older.threadId, older.before, messages[0]?.role);
      setMessages((all) => [...page.messages, ...all]);
      setOlderMedia((pages) => [...pages, mediaPaths(page.messages)]);
      setOlder(page.older);
      setOlderStatus('idle');
    } catch {
      setOlderStatus('failed');
    }
  }, [older, olderStatus, messages]);

  return {
    messages,
    /** Whether the thread has messages before those shown, and how reading them goes. */
    olderStatus: older ? olderStatus : undefined,
    /** The photos and voice messages of each page of older messages read, by page. */
    olderMedia,
    loadOlder,
    /** The thread the chat goes on in, once it has one. */
    thread,
    status,
    tool,
    failure,
    refusal,
    send,
    sendVoice,
    stop,
    askAgain,
    /** Tries the last question again, when that is what the failure offers. */
    retry: canRetry ? retry : undefined,
  };
}
