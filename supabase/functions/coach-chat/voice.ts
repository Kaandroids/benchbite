// The voice message of a message to Bite (#298, ADR 0072): checked before anything is sent or
// kept, kept in `coach-media` as photos are (ADR 0062), and written down by the model, so that the
// thread keeps what was said as its text.
import type { AiModel } from '../_shared/ai_usage.ts';
import { decodeBase64 } from '../_shared/base64.ts';
import { decodedBytes } from '../_shared/base64_bytes.ts';
import {
  type ChatVoice,
  type ChatVoicePart,
  MAX_VOICE_BYTES,
  MAX_VOICE_BYTES_PER_SECOND,
  MAX_VOICE_SECONDS,
  type VoiceRefusal,
} from '../_shared/coach/chat.ts';
import { type Part, textOf } from '../_shared/llm/mod.ts';
import { type Client, logError } from '../_shared/supabase.ts';
import { keepFile } from './media.ts';

/** A voice message that passed the checks: its bytes to keep, its base64 data for the model. */
export type CheckedVoice = { bytes: Uint8Array; data: string; durationMs: number };

/** How much longer than the limit a voice message may be: the recorder stops a moment after it. */
const VOICE_SLACK_MS = 1000;

/** Room for a voice message's boxes beside its audio, in bytes, which a short one weighs most by. */
const VOICE_HEADER_BYTES = 16_000;

/**
 * Checks a voice message, as base64 data, before anything is sent or kept: within its size, an MP4
 * file, which AAC audio is kept in, and within its length, as the file itself gives it, not the
 * app, and as its weight bears out. Gives it with its bytes and length, or why it is refused.
 */
export function checkVoice(voice: ChatVoice): CheckedVoice | VoiceRefusal {
  if (decodedBytes(voice.data) > MAX_VOICE_BYTES) return 'voice_too_large';
  const bytes = decodeBase64(voice.data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (box(view, 0, bytes.length)?.type !== 'ftyp') return 'voice_not_m4a';
  const durationMs = mp4Length(view);
  if (!durationMs) return 'voice_not_m4a';
  if (durationMs > MAX_VOICE_SECONDS * 1000 + VOICE_SLACK_MS) return 'voice_too_long';
  // A header can say less than the file holds.
  const heaviest = (durationMs / 1000) * MAX_VOICE_BYTES_PER_SECOND + VOICE_HEADER_BYTES;
  if (bytes.length > heaviest) return 'voice_too_long';
  return { bytes, data: voice.data, durationMs };
}

/** An MP4 box: its type, and where its contents start and end. */
type Box = { type: string; start: number; end: number };

/** The box at `at`, within `end`, or nothing for one that does not fit. */
function box(view: DataView, at: number, end: number): Box | undefined {
  if (at + 8 > end) return undefined;
  let size = view.getUint32(at);
  let header = 8;
  if (size === 1) {
    // A 64-bit size follows the type.
    if (at + 16 > end) return undefined;
    size = Number(view.getBigUint64(at + 8));
    header = 16;
  } else if (size === 0) {
    // The box goes on to the end.
    size = end - at;
  }
  if (size < header || at + size > end) return undefined;
  const type = String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + at + 4, 4));
  return { type, start: at + header, end: at + size };
}

/** The first box of a type among those from `at` to `end`. */
function find(view: DataView, at: number, end: number, type: string): Box | undefined {
  for (let found = box(view, at, end); found; found = box(view, found.end, end)) {
    if (found.type === type) return found;
  }
  return undefined;
}

/**
 * An MP4 file's length in milliseconds, from its movie header (`moov` › `mvhd`), wherever in the
 * file the movie is; nothing for a file without one.
 */
export function mp4Length(view: DataView): number | undefined {
  const moov = find(view, 0, view.byteLength, 'moov');
  const mvhd = moov && find(view, moov.start, moov.end, 'mvhd');
  if (!mvhd) return undefined;
  // After its version and flags, and its times of creation and change: 4 bytes each, or 8 in
  // version 1. Then its time scale, and its duration in it.
  if (mvhd.start >= mvhd.end) return undefined;
  const wide = view.getUint8(mvhd.start) === 1;
  const at = mvhd.start + (wide ? 20 : 12);
  if (at + (wide ? 12 : 8) > mvhd.end) return undefined;
  const scale = view.getUint32(at);
  const duration = wide ? Number(view.getBigUint64(at + 4)) : view.getUint32(at + 4);
  return scale ? Math.round((duration / scale) * 1000) : undefined;
}

/** The voice message as the model hears it, in its own turn only. */
export function audioPart(voice: CheckedVoice): Part {
  return { type: 'audio', mimeType: 'audio/mp4', data: voice.data };
}

/**
 * Keeps a voice message, and gives the message's part that names it, or nothing when it could not
 * be kept.
 */
export async function storeVoice(
  admin: Client,
  userId: string,
  threadId: number,
  voice: CheckedVoice,
): Promise<ChatVoicePart | undefined> {
  const path = await keepFile(admin, userId, threadId, voice.bytes, 'audio/mp4');
  if (!path) return undefined;
  return { type: 'audio', path, mimeType: 'audio/mp4', durationMs: voice.durationMs };
}

/** What the model is told to write down a voice message by. */
const TRANSCRIBE =
  'Write down exactly what the speaker says, in the language they speak, with punctuation. Give only the words said, nothing else. If nothing is said, give nothing.';

/**
 * What was said in a voice message, as the model writes it down; nothing when it could not be, as
 * when the model failed or the budget refused it. The thread then keeps the message without it.
 */
export async function transcribe(model: AiModel, voice: CheckedVoice): Promise<string | undefined> {
  try {
    const response = await model.generate({
      system: TRANSCRIBE,
      messages: [{ role: 'user', parts: [audioPart(voice)] }],
      maxOutputTokens: 1024,
    });
    return textOf(response.parts).trim() || undefined;
  } catch (error) {
    logError('Could not write down a voice message', error);
    return undefined;
  }
}
