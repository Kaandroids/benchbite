import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

/** How often the playing message's place is read, in ms, for its bars to follow. */
const UPDATE_MS = 100;

/** The voice message playing, or the last one played, and where it is. */
export type Playing = { id: string; playing: boolean; positionMs: number };

/**
 * Plays the chat's voice messages, one at a time, with one player for the chat (board 6b): a
 * message played while another plays takes its place, and one played to its end goes back to its
 * start.
 */
export function useVoicePlayback() {
  const player = useAudioPlayer(null, { updateInterval: UPDATE_MS });
  const status = useAudioPlayerStatus(player);
  const [id, setId] = useState<string>();
  // Read by toggle(), which stays the same each render so that the messages do not render again.
  const current = useRef({ id, playing: status.playing });
  useEffect(() => {
    current.current = { id, playing: status.playing };
  }, [id, status.playing]);

  const finished = status.didJustFinish;
  useEffect(() => {
    if (!finished) return;
    player.pause();
    void player.seekTo(0);
  }, [finished, player]);

  /** Plays a message from `source`, its file or its address, or pauses it while it plays. */
  const toggle = useCallback(
    (messageId: string, source: string) => {
      if (current.current.id === messageId) {
        if (current.current.playing) return player.pause();
        return player.play();
      }
      // Out of the speaker, also in silent mode, as the user asked for it.
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      player.replace({ uri: source });
      setId(messageId);
      player.play();
    },
    [player],
  );

  /** Pauses what plays, as when the user records. */
  const pause = useCallback(() => player.pause(), [player]);

  const playing: Playing | undefined = id
    ? { id, playing: status.playing, positionMs: Math.round(status.currentTime * 1000) }
    : undefined;
  return { playing, toggle, pause };
}
