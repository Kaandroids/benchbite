import type { AudioPlayer } from 'expo-audio';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { userBubble } from './bubble-shape';
import { type MessageVoice, voiceLength } from './chat-voice';
import { type Playing, usePlaying } from './use-voice-playback';

/** The play button, and the bars beside it. */
const BUTTON = 36;
const BAR_WIDTH = 3;
const BAR_GAP = 4;
const BARS_HEIGHT = 26;

/** How many bars a voice message shows: more for a longer one, within the bubble. */
function barCount(durationMs: number): number {
  return Math.min(22, Math.max(12, 10 + Math.round(durationMs / 2000)));
}

/**
 * The heights of a voice message's bars, from 0.2 to 1: drawn from `seed`, as no loudness is kept,
 * so that each message looks its own and the same each time.
 */
export function barHeights(seed: string, count: number): number[] {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return Array.from({ length: count }, () => {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    hash ^= hash >>> 16;
    return 0.2 + ((hash >>> 0) % 1000) / 1250;
  });
}

type VoiceBubbleProps = {
  id: string;
  voice: MessageVoice;
  /** What was said in it, once written down. */
  text: string;
  /** Its file on the device, or its address once read; none while it is read. */
  source?: string;
  /** The chat's player, while it holds this message. */
  player?: AudioPlayer;
  onPlay?: (id: string, source: string) => void;
};

/**
 * The user's voice message (board 6b): a button that plays and pauses it, its bars, filled as far
 * as it played, and its length, or where it is while it plays; what was said in it under them.
 * Only the message in the player reads where it is, so that the chat does not render as it plays.
 */
export function VoiceBubble({ player, ...props }: VoiceBubbleProps) {
  return player ? <PlayingVoice player={player} {...props} /> : <Voice {...props} />;
}

function PlayingVoice({
  player,
  ...props
}: Omit<VoiceBubbleProps, 'player'> & { player: AudioPlayer }) {
  return <Voice {...props} playing={usePlaying(player)} />;
}

function Voice({
  id,
  voice,
  text,
  source,
  playing,
  onPlay,
}: Omit<VoiceBubbleProps, 'player'> & { playing?: Playing }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  // Drawn from its length in seconds, which the message has as sent and as kept alike.
  const seconds = Math.round(voice.durationMs / 1000);
  const heights = barHeights(String(seconds), barCount(voice.durationMs));
  const played = playing && voice.durationMs > 0 ? playing.positionMs / voice.durationMs : 0;
  const shownMs = playing?.playing || played > 0 ? playing!.positionMs : voice.durationMs;
  return (
    <View
      style={[
        userBubble,
        {
          backgroundColor: colors.userBubble,
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
        },
      ]}
    >
      <View style={[styles.row, { gap: spacing.sm + 2 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing?.playing ? t('bite.voice.pause') : t('bite.voice.play')}
          accessibilityHint={t('bite.voice.label', { length: voiceLength(voice.durationMs) })}
          accessibilityState={{ disabled: !source }}
          disabled={!source || !onPlay}
          onPress={() => source && onPlay?.(id, source)}
          hitSlop={6}
          style={({ pressed }) => [
            styles.play,
            {
              backgroundColor: colors.primaryButton,
              opacity: !source ? 0.4 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Icon name={playing?.playing ? 'pause' : 'play'} size={16} color="onPrimary" />
        </Pressable>
        <View style={styles.bars} aria-hidden>
          {heights.map((height, index) => (
            <View
              key={index}
              style={[
                styles.bar,
                {
                  height: Math.max(BAR_WIDTH, height * BARS_HEIGHT),
                  backgroundColor:
                    (index + 0.5) / heights.length <= played
                      ? colors.primaryText
                      : colors.placeholder,
                },
              ]}
            />
          ))}
        </View>
        <Text variant="captionStrong" color="textMuted" aria-hidden>
          {voiceLength(shownMs)}
        </Text>
      </View>
      {text ? (
        <Text variant="caption" color="textMuted">
          {text}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  play: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bars: {
    height: BARS_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: BAR_GAP,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
  },
});
