import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  FadeInLeft,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { BiteAvatar } from '@/coach/bite-avatar';
import { Icon } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { addDays, isoWeekday, toIsoDate, useWeekdayFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';

/** How many days the free trial lasts. */
export const TRIAL_DAYS = 7;

type TrialWeekProps = {
  /** The trial's first day. */
  startedOn: Date;
  /** Today's place in the trial, from 0 for its first day. */
  todayIndex: number;
  /** The days the user used Bite on, as ISO dates. */
  usedOn: readonly string[];
  /** What the user did with Bite in the trial. */
  usage: { chats: number; photos: number; reviews: number };
};

/**
 * The trial's week as a strip (#411): the days gone in the brand's orange and those left lighter,
 * Bite standing on today, a dot under each day the user used it, and a star on the last day.
 */
export function TrialWeek({ startedOn, todayIndex, usedOn, usage }: TrialWeekProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const weekday = useWeekdayFormat('short');
  const days = Array.from({ length: TRIAL_DAYS }, (_, index) => addDays(startedOn, index));
  const last = TRIAL_DAYS - 1;

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
              <Icon name="star" size={20} color="primary" />
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
            {t('premium.trialEnding.together', { count: last - todayIndex })}
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
          styles.row,
          {
            gap: spacing.sm,
            marginTop: spacing.md,
            paddingTop: spacing.md,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
          },
        ]}
      >
        {(
          [
            ['chat', 'chats', usage.chats],
            ['camera', 'photos', usage.photos],
            ['chart', 'reviews', usage.reviews],
          ] as const
        ).map(([icon, kind, count]) => (
          <View key={kind} style={[styles.stat, { gap: spacing.sm }]}>
            <IconTile name={icon} size={30} />
            <View>
              <Text variant="label">{count}</Text>
              <Text variant="caption" color="textMuted">
                {t(`premium.trialEnding.${kind}`, { count })}
              </Text>
            </View>
          </View>
        ))}
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
    if (pulses && !reduceMotion) {
      opacity.set(withRepeat(withTiming(0.45, { duration: 800 }), -1, true));
    }
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
  stat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
