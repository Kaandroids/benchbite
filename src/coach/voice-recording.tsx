import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type GestureResponderEvent, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { BiteAvatar } from './bite-avatar';
import { voiceLength } from './chat-voice';
import { LEVELS } from './use-voice-recorder';

/** How far left the finger slides, in points, to cancel a recording. */
export const CANCEL_DISTANCE = 80;

/** The mic while the composer is empty, and while it records, larger. */
const MIC = 44;
const MIC_RECORDING = 64;

type MicButtonProps = {
  recording: boolean;
  /** Whether letting go now cancels, as the finger slid far enough left. */
  cancelling: boolean;
  onHold: () => void;
  /** Ends the hold: sends, or cancels when the finger slid away. */
  onRelease: (cancel: boolean) => void;
  onSlide: (cancelling: boolean) => void;
};

/**
 * The mic of an empty composer (board 1): held, it records, and let go, it sends (board 6);
 * slid left first, it cancels. A screen reader's double tap starts and sends instead, as one
 * cannot hold there.
 */
export function MicButton({ recording, cancelling, onHold, onRelease, onSlide }: MicButtonProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const startX = useRef(0);
  const sliding = useRef(false);
  const size = recording ? MIC_RECORDING : MIC;
  const slid = (event: GestureResponderEvent) =>
    event.nativeEvent.pageX - startX.current < -CANCEL_DISTANCE;
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={recording ? t('bite.voice.recording') : t('bite.voice.hold')}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => (recording ? onRelease(false) : onHold())}
      onStartShouldSetResponder={() => true}
      // The chat's scroll may not take the hold away while it records.
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => {
        startX.current = event.nativeEvent.pageX;
        sliding.current = false;
        onHold();
      }}
      onResponderMove={(event) => {
        const now = slid(event);
        if (now !== sliding.current) {
          sliding.current = now;
          onSlide(now);
        }
      }}
      onResponderRelease={(event) => onRelease(slid(event))}
      onResponderTerminate={() => onRelease(true)}
      hitSlop={6}
      style={[
        styles.mic,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: cancelling ? colors.track : colors.primaryButton,
        },
      ]}
    >
      <Icon name="mic" size={recording ? 28 : 22} color={cancelling ? 'textMuted' : 'onPrimary'} />
    </View>
  );
}

/**
 * What the composer shows above its line while it records (board 6): Bite listening, how long the
 * message is so far, and how loud each moment was.
 */
export function RecordingHeader({ durationMs, levels }: { durationMs: number; levels: number[] }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <View style={[styles.header, { gap: spacing.sm, paddingTop: spacing.md }]}>
      <BiteAvatar size={92} state="listening" />
      <View style={styles.center}>
        <Text variant="bodyStrong">{t('bite.voice.listening')}</Text>
        <Text
          variant="captionStrong"
          color="textMuted"
          accessibilityLiveRegion="polite"
          // The time read out every second would talk over the user.
          importantForAccessibility="no-hide-descendants"
        >
          {t('bite.voice.release', { time: voiceLength(durationMs) })}
        </Text>
      </View>
      <VoiceLevels levels={levels} />
    </View>
  );
}

/** The bars of a recording's loudness, the latest last, and quiet dots where none came yet. */
function VoiceLevels({ levels }: { levels: number[] }) {
  const { colors } = useTheme();
  const bars = Array.from({ length: LEVELS }, (_, index) => levels[index]);
  return (
    <View style={styles.levels} aria-hidden>
      {bars.map((value, index) => (
        <View
          key={index}
          style={[
            styles.bar,
            value === undefined
              ? { height: BAR_WIDTH, backgroundColor: colors.track }
              : {
                  height: BAR_WIDTH + value * (LEVELS_HEIGHT - BAR_WIDTH),
                  backgroundColor: colors.primaryText,
                },
          ]}
        />
      ))}
    </View>
  );
}

/** Where the cancel goes, left on the composer's line while it records, and what the slide does. */
export function SlideToCancel({ cancelling }: { cancelling: boolean }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return (
    <View style={[styles.slide, { gap: spacing.md }]}>
      <View
        style={[
          styles.trash,
          {
            borderColor: colors.border,
            backgroundColor: cancelling ? colors.dangerBackground : colors.surface,
          },
        ]}
        aria-hidden
      >
        <Icon name="trash" size={22} color="danger" />
      </View>
      <Text variant="captionStrong" color={cancelling ? 'danger' : 'textMuted'} style={styles.flex}>
        {cancelling ? t('bite.voice.releaseToCancel') : t('bite.voice.slideToCancel')}
      </Text>
    </View>
  );
}

const BAR_WIDTH = 4;
const LEVELS_HEIGHT = 32;

const styles = StyleSheet.create({
  mic: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
  },
  center: {
    alignItems: 'center',
    gap: 2,
  },
  levels: {
    height: LEVELS_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
  },
  slide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  trash: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
});
