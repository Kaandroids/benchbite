// The voice messages of the chat with Bite (#298, ADR 0072): recorded on the device and sent as
// base64 AAC, and read back from `coach-media` when a chat is opened again.
import type { ChatVoicePart, VoiceRefusal } from '@shared/coach/chat';
import { MAX_VOICE_BYTES_PER_SECOND } from '@shared/coach/chat';
import { AudioQuality, IOSOutputFormat, type RecordingOptions } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

import type { Json } from '@/lib/database.types';

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
export type VoiceProblem = {
  reason: VoiceRefusal | 'voice_not_recorded' | 'microphone_denied';
};

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

/**
 * Deletes recordings the app kept in its cache folder, once their chat closes. A file anywhere
 * else, or one already gone, is left alone.
 */
export function discardVoices(uris: string[]) {
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
