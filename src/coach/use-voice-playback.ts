import {
  type AudioPlayer,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { PLAYBACK_MODE } from './chat-voice';

/** How often the playing message's place is read, in ms, for its bars to follow. */
const UPDATE_MS = 100;

/** Whether a voice message plays, and where it is. */
export type Playing = { playing: boolean; positionMs: number };

/**
 * Plays the chat's voice messages, one at a time, with one player for the chat (board 6b): a
 * message played while another plays takes its place. Where it is, is read by its bubble alone
 * (usePlaying()), so that the chat does not render again as it plays.
 */
export function useVoicePlayback() {
  const player = useAudioPlayer(null, { updateInterval: UPDATE_MS });
  /** The message playing, or the last one played. */
  const [active, setActive] = useState<string>();
  // Read by toggle(), which stays the same so that the messages do not render again.
  const activeRef = useRef(active);

  /** Plays a message from `source`, its file or its address, or pauses it while it plays. */
  const toggle = useCallback(
    (messageId: string, source: string) => {
      if (activeRef.current === messageId) {
        return player.playing ? player.pause() : player.play();
      }
      // Out of the speaker, also in silent mode, as the user asked for it.
      void setAudioModeAsync(PLAYBACK_MODE);
      player.replace({ uri: source });
      activeRef.current = messageId;
      setActive(messageId);
      player.play();
    },
    [player],
  );

  /** Pauses what plays, as when the user records. */
  const pause = useCallback(() => player.pause(), [player]);

  return { player, active, toggle, pause };
}

/**
 * Whether the message in `player` plays, and where it is; one played to its end goes back to its
 * start.
 */
export function usePlaying(player: AudioPlayer): Playing {
  const status = useAudioPlayerStatus(player);
  const finished = status.didJustFinish;
  useEffect(() => {
    if (!finished) return;
    player.pause();
    void player.seekTo(0);
  }, [finished, player]);
  return { playing: status.playing, positionMs: Math.round(status.currentTime * 1000) };
}
