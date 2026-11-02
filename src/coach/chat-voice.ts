// The voice messages of the chat with Bite (#298, ADRs 0072 and 0073): recorded on the device and
// sent as base64 AAC, and read back from `coach-media` when a chat is opened again.
import type { ChatVoicePart } from '@shared/coach/chat';
import { MAX_VOICE_BYTES_PER_SECOND, VOICE_REFUSALS } from '@shared/coach/chat';
import { AudioQuality, IOSOutputFormat, type RecordingOptions } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

import type { Json } from '@/lib/database.types';
import { readItem, writeItem } from '@/lib/device-storage';

/** A voice message recorded, ready to send: its base64 data, its length, and its file. */
export type VoiceDraft = { data: string; durationMs: number; uri: string };

/**
 * The voice message of a message: one the user sends now, played from its file on the device,
 * with its data to send it again; or one kept with a chat, by its path in `coach-media`.
 */
export type MessageVoice = { durationMs: number } & (
  { uri: string; data: string; path?: never } | { path: string; uri?: never; data?: never }
);

/**
 * Why a voice message was not sent: refused by coach-chat, or on the device, as one that could
 * not be recorded or read, or without the microphone.
 */
export const VOICE_PROBLEMS = [
  ...VOICE_REFUSALS,
  'voice_not_recorded',
  'microphone_denied',
] as const;
export type VoiceProblem = { reason: (typeof VOICE_PROBLEMS)[number] };

/** Whether a message's problem is its voice message's, which has no photo to name. */
export function isVoiceProblem(problem: { reason: string }): problem is VoiceProblem {
  return (VOICE_PROBLEMS as readonly string[]).includes(problem.reason);
}

/** The bit rate a voice message is recorded at, well within what coach-chat takes a second. */
const BIT_RATE = 64_000;

/**
 * How a voice message is recorded: AAC in an MP4 container, as coach-chat takes it, in mono, at a
 * bit rate that keeps a minute well under its limits, with its loudness read as it records.
 */
export const VOICE_RECORDING: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 44_100,
  numberOfChannels: 1,
  bitRate: BIT_RATE,
  isMeteringEnabled: true,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.HIGH },
  web: { mimeType: 'audio/mp4', bitsPerSecond: BIT_RATE },
};

// The bit rate stays within what coach-chat takes, with room for the file's boxes.
if (BIT_RATE / 8 > MAX_VOICE_BYTES_PER_SECOND / 2) {
  throw new Error('Voice messages would be recorded heavier than coach-chat takes them');
}

/** A recording's data, to send, read from its file, which is kept to play it. */
export async function readVoice(uri: string): Promise<string> {
  return new File(uri).base64();
}

/** Where the recordings not deleted yet are listed, on the device. */
const RECORDED_KEY = 'coach.recordedVoices';

function recordedVoices(): string[] {
  try {
    const list: unknown = JSON.parse(readItem(RECORDED_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((uri) => typeof uri === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Lists a recording until it is deleted, so that one the app could not delete, as when it was
 * closed with the chat open, goes the next time Bite opens (sweepVoices()).
 */
export function listRecording(uri: string) {
  const all = recordedVoices();
  if (!all.includes(uri)) writeItem(RECORDED_KEY, JSON.stringify([...all, uri]));
}

/**
 * Deletes recordings the app kept in its cache folder, as their chat closes. A file anywhere else,
 * or one already gone, is left alone.
 */
export function discardVoices(uris: string[]) {
  if (!uris.length) return;
  // Deleting is tidying up: it never fails what it follows.
  try {
    const cache = Paths.cache.uri;
    for (const uri of uris.filter((voice) => voice.startsWith(cache))) {
      const file = new File(uri);
      if (file.exists) file.delete();
    }
  } catch (error) {
    console.warn('Could not delete a voice message recorded', error);
  }
  const left = recordedVoices().filter((uri) => !uris.includes(uri));
  writeItem(RECORDED_KEY, left.length ? JSON.stringify(left) : null);
}

let swept = false;

/**
 * Deletes the recordings left from before the app last started, once: those of this run belong to
 * a chat that may still be open.
 */
export function sweepVoices() {
  if (swept) return;
  swept = true;
  discardVoices(recordedVoices());
}

/** The voice message a stored message keeps, by its path in `coach-media`; none without one. */
export function messageVoice(content: Json): MessageVoice | undefined {
  const parts = Array.isArray(content) ? content : [];
  for (const part of parts) {
    if (!part || typeof part !== 'object' || Array.isArray(part)) continue;
    const { type, path, durationMs } = part as Partial<ChatVoicePart>;
    if (type === 'audio' && typeof path === 'string') {
      return { path, durationMs: typeof durationMs === 'number' ? durationMs : 0 };
    }
  }
  return undefined;
}

/** A length as the chat shows it, m:ss. */
export function voiceLength(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
