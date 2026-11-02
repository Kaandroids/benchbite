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
import { box, mp4Length } from '../_shared/mp4.ts';
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
  'Write down exactly what the speaker says, in the language they speak, with punctuation. Give only the words said, nothing else. If nothing is said, or there is only silence or noise, give nothing at all: no placeholder such as <noise>, and no guess.';

/**
 * Placeholders for what was not said: anything in angle or square brackets, as "<noise>" or
 * "[silence]", and the usual words in parentheses, as "(inaudible)". Other words in parentheses
 * may be said, as "(Ja.)", and are kept.
 */
const PLACEHOLDERS =
  /<[^<>]*>|\[[^[\]]*\]|\((?:inaudible|unintelligible|silence|noise|background noise|no speech|music)\.?\)/giu;

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
    // Placeholders the model gives all the same, as "<noise>" or "[silence]", are nothing said;
    // what is left counts only with a word in it.
    const said = textOf(response.parts).replace(PLACEHOLDERS, ' ').replace(/\s+/g, ' ').trim();
    return /\p{L}/u.test(said) ? said : undefined;
  } catch (error) {
    logError('Could not write down a voice message', error);
    return undefined;
  }
}
