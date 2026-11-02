// The voice message of a message to Bite (#298, ADR 0072): checked before anything is sent or
// kept, kept in `coach-media` as photos are (ADR 0062), and written down by the model, so that the
// thread keeps what was said as its text.
import type { AiModel } from '../_shared/ai_usage.ts';
import { decodeBase64 } from '../_shared/base64.ts';
import {
  type ChatVoice,
  type ChatVoicePart,
  MAX_VOICE_BYTES,
  VOICE_REFUSALS,
} from '../_shared/coach/chat.ts';
import { MEDIA_BUCKET, threadMediaFolder } from '../_shared/coach/media.ts';
import { textOf } from '../_shared/llm/mod.ts';
import { decodedBytes } from '../_shared/photos.ts';
import { type Client, logError } from '../_shared/supabase.ts';

/** A voice message that passed the checks: its bytes to keep, its base64 data for the model. */
export type CheckedVoice = { bytes: Uint8Array; data: string; durationMs: number };

export type VoiceRefusal = (typeof VOICE_REFUSALS)[number];

/** The box an MP4 file starts with, after its length: `ftyp`. */
const FTYP = [0x66, 0x74, 0x79, 0x70];

/**
 * Checks a voice message, as base64 data, before anything is sent or kept: within its size, and an
 * MP4 file, which AAC audio is kept in. Gives it with its bytes, or why it is refused.
 */
export function checkVoice(voice: ChatVoice): CheckedVoice | VoiceRefusal {
  if (decodedBytes(voice.data) > MAX_VOICE_BYTES) return 'voice_too_large';
  const bytes = decodeBase64(voice.data);
  if (bytes.length < 8 || FTYP.some((byte, index) => bytes[4 + index] !== byte)) {
    return 'voice_not_m4a';
  }
  return { bytes, data: voice.data, durationMs: voice.durationMs };
}

/**
 * Keeps a voice message in its thread's folder under a new name, and gives the message's part that
 * names it, or nothing when it could not be kept. The bucket refuses what is not MP4 or too large.
 */
export async function storeVoice(
  admin: Client,
  userId: string,
  threadId: number,
  voice: CheckedVoice,
): Promise<ChatVoicePart | undefined> {
  const path = `${threadMediaFolder(userId, threadId)}/${crypto.randomUUID()}.m4a`;
  const { error } = await admin.storage
    .from(MEDIA_BUCKET)
    .upload(path, voice.bytes, { contentType: 'audio/mp4', upsert: false });
  if (error) return void logError('Could not keep a voice message', error);
  return { type: 'audio', path, mimeType: 'audio/mp4', durationMs: voice.durationMs };
}

/** What the model is told to write down a voice message by. */
export const TRANSCRIBE =
  'Write down exactly what the speaker says, in the language they speak, with punctuation. Give only the words said, nothing else. If nothing is said, give nothing.';

/**
 * What was said in a voice message, as the model writes it down; nothing when it could not be, as
 * when the model failed or the budget refused it. The thread then keeps the message without it.
 */
export async function transcribe(model: AiModel, voice: CheckedVoice): Promise<string | undefined> {
  try {
    const response = await model.generate({
      system: TRANSCRIBE,
      messages: [
        { role: 'user', parts: [{ type: 'audio', mimeType: 'audio/mp4', data: voice.data }] },
      ],
      maxOutputTokens: 1024,
    });
    return textOf(response.parts).trim() || undefined;
  } catch (error) {
    logError('Could not write down a voice message', error);
    return undefined;
  }
}
