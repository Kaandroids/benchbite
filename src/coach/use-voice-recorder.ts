import { MAX_VOICE_SECONDS } from '@shared/coach/chat';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';

import {
  discardVoices,
  readVoice,
  VOICE_RECORDING,
  type VoiceDraft,
  type VoiceProblem,
} from './chat-voice';

/** How often the recording's length and loudness are read, in ms. */
const UPDATE_MS = 100;

/** A recording shorter than this was a tap, not a message, and is not sent. */
export const SHORTEST_MS = 500;

/** How many bars of loudness the recording shows, the latest last. */
export const LEVELS = 24;

/** Loudness, in decibels, from silence to as loud as speech gets near the phone. */
const QUIET_DB = -50;
const LOUD_DB = -10;

/** How loud a moment was, from 0 to 1, as its bar shows it. */
export function level(db: number | undefined): number {
  if (db === undefined) return 0;
  return Math.min(1, Math.max(0, (db - QUIET_DB) / (LOUD_DB - QUIET_DB)));
}

export type VoiceEnd =
  | { sent: VoiceDraft }
  | { problem: VoiceProblem }
  /** Too short, a tap: the user is told how to record. */
  | { tooShort: true }
  | { cancelled: true };

/**
 * Records a voice message while the user holds the mic (#298, board 6): `start` asks for the
 * microphone the first time, without recording, as the question takes the hold; `finish` stops
 * and gives the message to send, or why there is none. A recording stops by itself at the most a
 * message may last, and is sent.
 */
export function useVoiceRecorder(onEnd: (end: VoiceEnd) => void) {
  const recorder = useAudioRecorder(VOICE_RECORDING);
  const state = useAudioRecorderState(recorder, UPDATE_MS);
  const [recording, setRecording] = useState(false);
  const [levels, setLevels] = useState<number[]>([]);
  /** Whether the user still holds the mic, as starting takes a moment and they may let go. */
  const held = useRef(false);
  const starting = useRef<Promise<boolean> | undefined>(undefined);

  // Each reading of the loudness is a bar.
  const metering = state.metering;
  const [readAt, setReadAt] = useState(state.durationMillis);
  if (recording && state.durationMillis !== readAt) {
    setReadAt(state.durationMillis);
    setLevels((all) => [...all, level(metering)].slice(-LEVELS));
  }

  const begin = async (): Promise<boolean> => {
    const permission = await getRecordingPermissionsAsync();
    if (!permission.granted) {
      // Asked once, as the hold ends; the next hold records.
      const asked = permission.canAskAgain ? await requestRecordingPermissionsAsync() : permission;
      if (!asked.granted) onEnd({ problem: { reason: 'microphone_denied' } });
      return false;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      return true;
    } catch (error) {
      console.warn('Could not start recording a voice message', error);
      onEnd({ problem: { reason: 'voice_not_recorded' } });
      return false;
    }
  };

  const start = () => {
    if (starting.current) return;
    held.current = true;
    setLevels([]);
    starting.current = begin().then((started) => {
      if (!started) {
        held.current = false;
        starting.current = undefined;
        return false;
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setRecording(true);
      // Let go while it started: it ends as the user wanted.
      if (!held.current) void finish(false);
      return true;
    });
  };

  const finish = async (send: boolean) => {
    held.current = false;
    const started = await starting.current;
    if (!started) return;
    starting.current = undefined;
    const durationMs = state.durationMillis;
    setRecording(false);
    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
    } catch (error) {
      console.warn('Could not stop recording a voice message', error);
    } finally {
      // Played back through the speaker again, not the earpiece.
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    }
    if (!send) {
      if (uri) discardVoices([uri]);
      return onEnd({ cancelled: true });
    }
    if (durationMs < SHORTEST_MS) {
      if (uri) discardVoices([uri]);
      return onEnd({ tooShort: true });
    }
    if (!uri) return onEnd({ problem: { reason: 'voice_not_recorded' } });
    try {
      onEnd({ sent: { data: await readVoice(uri), durationMs, uri } });
    } catch (error) {
      console.warn('Could not read a voice message recorded', error);
      discardVoices([uri]);
      onEnd({ problem: { reason: 'voice_not_recorded' } });
    }
  };

  // At the most a message may last, it is sent, though the user still holds the mic.
  const full = recording && state.durationMillis >= MAX_VOICE_SECONDS * 1000;
  useEffect(() => {
    if (full) void finish(true);
    // finish() reads the recorder as it is when the limit is reached.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  return {
    recording,
    /** How long the recording is so far, in ms. */
    durationMs: recording ? state.durationMillis : 0,
    /** The loudness of the last moments, from 0 to 1, the latest last. */
    levels,
    start,
    finish,
  };
}
