import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  cancelAnimation,
  FadeInLeft,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { BiteAvatar } from '@/coach/bite-avatar';
import { SparkleStar } from '@/components/ui/sparkles';
import { Text } from '@/components/ui/text';
import { addDays, isoWeekday, toIsoDate, useWeekdayFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';

import { TRIAL_DAYS, type TrialUsage } from './trial';
import { UsageStats } from './usage-stats';

type TrialWeekProps = {
  /** The trial's first day. */
  startedOn: Date;
  /** Today's place in the trial, from 0 for its first day. */
  todayIndex: number;
  /** The days the user used Bite on, as ISO dates. */
  usedOn: readonly string[];
  /** What the user did with Bite in the trial. */
  usage: TrialUsage;
};

/**
 * The trial's week as a strip (#411): the days gone in the brand's orange and those left lighter,
 * Bite standing on today, a dot under each day the user used it, and a star on the last day.
 */
export function TrialWeek({ startedOn, todayIndex: index, usedOn, usage }: TrialWeekProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const weekday = useWeekdayFormat('short');
  const days = Array.from({ length: TRIAL_DAYS }, (_, index) => addDays(startedOn, index));
  const last = TRIAL_DAYS - 1;
  const todayIndex = Math.min(Math.max(index, 0), last);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radii.lg + 6,
          padding: spacing.md,
        },
      ]}
    >
      <View style={styles.stage}>
        {days.map((day, index) => (
          <View key={index} style={styles.column}>
            {index === todayIndex ? (
              <Animated.View entering={FadeInLeft.duration(700)}>
                <BiteAvatar size={52} expression="happy" looksAbout />
              </Animated.View>
            ) : index === last ? (
              <SparkleStar size={22} twinkles />
            ) : null}
          </View>
        ))}
        <Animated.View
          entering={ZoomIn.delay(700)}
          style={[
            styles.bubble,
            {
              backgroundColor: colors.inverseSurface,
              paddingHorizontal: spacing.sm + 2,
              paddingVertical: spacing.xs + 2,
            },
          ]}
        >
          <Text variant="captionStrong" color="onInverse">
            {todayIndex === last
              ? t('premium.trialEnding.lastDay')
              : t('premium.trialEnding.together', { count: last - todayIndex })}
          </Text>
        </Animated.View>
      </View>

      <View style={[styles.row, styles.bar, { marginTop: spacing.sm }]}>
        {days.map((_, index) => (
          <Segment
            key={index}
            gone={index <= todayIndex}
            pulses={index === todayIndex + 1}
            first={index === 0}
            last={index === last}
          />
        ))}
      </View>
      <View style={[styles.row, { marginTop: spacing.xs }]}>
        {days.map((day, index) => (
          <Text
            key={index}
            variant="captionStrong"
            color={index === todayIndex ? 'text' : index === last ? 'primaryText' : 'textMuted'}
            style={styles.column}
          >
            {index === todayIndex ? t('premium.trialEnding.today') : weekday(isoWeekday(day))}
          </Text>
        ))}
      </View>
      <View
        accessible
        accessibilityLabel={t('premium.trialEnding.usedDays', {
          count: days.filter((day) => usedOn.includes(toIsoDate(day))).length,
        })}
        style={[styles.row, { marginTop: 4 }]}
      >
        {days.map((day, index) => (
          <View key={index} style={styles.column}>
            {index <= todayIndex ? (
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: usedOn.includes(toIsoDate(day)) ? colors.text : colors.border,
                  },
                ]}
              />
            ) : null}
          </View>
        ))}
      </View>

      <View
        style={[
          {
            marginTop: spacing.lg,
            paddingTop: spacing.lg,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
          },
        ]}
      >
        <UsageStats
          stats={[
            {
              icon: 'chat',
              count: usage.chats,
              label: t('premium.trialEnding.chats', { count: usage.chats }),
              color: 'info',
              background: 'infoBackground',
            },
            {
              icon: 'camera',
              count: usage.photos,
              label: t('premium.trialEnding.photos', { count: usage.photos }),
              color: 'snack',
              background: 'snackBackground',
            },
            {
              icon: 'trend',
              count: usage.reviews,
              label: t('premium.trialEnding.reviews', { count: usage.reviews }),
              color: 'breakfast',
              background: 'breakfastBackground',
            },
          ]}
        />
      </View>
    </View>
  );
}

type SegmentProps = { gone: boolean; pulses: boolean; first: boolean; last: boolean };

/** A day of the strip; the next day left fades in and out, unless the user asks for less motion. */
function Segment({ gone, pulses, first, last }: SegmentProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(opacity);
    opacity.set(1);
    if (pulses && !reduceMotion) {
      opacity.set(withRepeat(withTiming(0.45, { duration: 800 }), -1, true));
    }
    return () => cancelAnimation(opacity);
  }, [pulses, reduceMotion, opacity]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      style={[
        styles.segment,
        {
          backgroundColor: gone ? colors.primaryButton : colors.planned,
          borderTopLeftRadius: first ? 5 : 0,
          borderBottomLeftRadius: first ? 5 : 0,
          borderTopRightRadius: last ? 5 : 0,
          borderBottomRightRadius: last ? 5 : 0,
        },
        pulseStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
  stage: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 70,
  },
  bubble: {
    position: 'absolute',
    left: 0,
    top: 0,
    maxWidth: '62%',
    borderRadius: 14,
    borderBottomRightRadius: 4,
  },
  row: {
    flexDirection: 'row',
  },
  bar: {
    gap: 1,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    textAlign: 'center',
  },
  segment: {
    flex: 1,
    height: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
