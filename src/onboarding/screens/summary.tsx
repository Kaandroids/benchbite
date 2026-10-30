import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { goalPace, weightGoal } from '@/body/body';
import { Button } from '@/components/ui/button';
import { Caption } from '@/components/ui/caption';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { SuccessBadge } from '@/components/ui/success-badge';
import { Text } from '@/components/ui/text';
import { useShortDateFormat, useTimeFormat, useWeekdayFormat } from '@/i18n/dates';
import { useNumberFormat, useWeightLabel } from '@/i18n/units';
import { MACROS } from '@/nutrition/macro-targets';
import { nextSession } from '@/workouts/next-session';
import { useTheme } from '@/theme';

import { Confetti } from '../confetti';
import { planDays } from '../plan-days';
import { useStep } from '../use-step';

/** Delay between the parts of the screen appearing. */
const STEP_MS = 120;
/** The confetti waits for the last part to appear. */
const CONFETTI_DELAY_MS = STEP_MS * 7 + 400;

/**
 * The end of the onboarding: confetti, what was set up, a card each, and the first workout.
 * Everything is already saved, so there is no way back; continuing opens the app.
 */
export function SummaryStep() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const weightLabel = useWeightLabel();
  const weekdayName = useWeekdayFormat();
  const shortWeekday = useWeekdayFormat('short');
  const formatTime = useTimeFormat();
  const [today] = useState(() => new Date());
  const shortDate = useShortDateFormat(today);
  const { answers, progress, next } = useStep('summary');
  const { targets, plan, reminderMinutes } = answers;
  const days = plan ? planDays(plan) : [];
  const upcoming = plan ? nextSession({ sessions: days }, today) : null;
  const weekdays = days.map((day) => day.weekday).sort((a, b) => a - b);
  const unit = answers.weightUnit ?? 'kg';
  const aim = weightGoal(answers);
  const date =
    aim && answers.weightKg
      ? goalPace(answers.weightKg, aim.targetKg, aim.paceKg, answers.achievablePaceKg, today).date
      : null;

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  return (
    <Screen
      progress={progress}
      footer={<Button label={t('onboarding.summary.start')} onPress={() => next()} />}
    >
      {/* Once the cards are in, so the burst comes as the result shows. */}
      <Confetti delay={CONFETTI_DELAY_MS} />
      <View style={[styles.center, { gap: spacing.sm, marginBottom: spacing.sm }]}>
        <SuccessBadge />
        <Animated.View entering={FadeInDown.delay(STEP_MS * 2).duration(400)}>
          <Text variant="hero" align="center" accessibilityRole="header">
            {answers.displayName
              ? t('onboarding.summary.titleNamed', { name: answers.displayName })
              : t('onboarding.steps.summary.title')}
          </Text>
          <Text color="textMuted" align="center">
            {t('onboarding.summary.body')}
          </Text>
        </Animated.View>
      </View>

      {targets ? (
        <Card entering={FadeInDown.delay(STEP_MS * 3).duration(400)} style={{ gap: spacing.xs }}>
          <Caption>{t('onboarding.summary.target')}</Caption>
          <Text variant="hero" color="primaryText">
            {t('nutrition.calories', { calories: format(targets.calories) })}
          </Text>
          <View style={[styles.row, styles.wrap, { gap: spacing.md }]}>
            {MACROS.map(({ key, grams }) => (
              <Text key={key} variant="captionStrong" color="textMuted">
                {t('nutrition.macroGrams', {
                  grams: format(targets[grams]),
                  macro: t(`nutrition.macros.${key}`).toLowerCase(),
                })}
              </Text>
            ))}
          </View>
        </Card>
      ) : null}

      {plan ? (
        <View style={[styles.tiles, { gap: spacing.md }]}>
          <Tile
            delay={STEP_MS * 4}
            caption={t('onboarding.summary.workoutsTile')}
            value={t('onboarding.summary.perWeek', { count: days.length })}
            detail={weekdays.map((day) => shortWeekday(day)).join(' · ')}
          />
          {aim && date ? (
            <Tile
              delay={STEP_MS * 5}
              caption={t('onboarding.summary.goalTile')}
              value={weightLabel(aim.targetKg, unit)}
              detail={t('onboarding.summary.by', { date: shortDate(date) })}
            />
          ) : answers.sessionMinutes ? (
            <Tile
              delay={STEP_MS * 5}
              caption={t('onboarding.summary.lengthTile')}
              value={t('onboarding.minutes', { count: answers.sessionMinutes })}
            />
          ) : null}
        </View>
      ) : null}

      {upcoming ? (
        <Card
          entering={FadeInDown.delay(STEP_MS * 6).duration(400)}
          style={[styles.row, { gap: spacing.md, borderColor: colors.primary, borderWidth: 2 }]}
        >
          <IconTile name="dumbbell" size={44} />
          <View style={styles.flex}>
            <Text variant="captionStrong" color="primaryText">
              {upcoming.inDays === 0
                ? t('onboarding.summary.firstToday')
                : upcoming.inDays === 1
                  ? t('onboarding.summary.firstTomorrow')
                  : t('onboarding.summary.firstOn', {
                      day: weekdayName(upcoming.session.weekday),
                    })}
            </Text>
            <Text variant="headline">{t(`workout.sessionTypes.${upcoming.session.type}`)}</Text>
            <Text variant="caption" color="textMuted">
              {t('workout.session', {
                count: upcoming.session.exercises.length,
                minutes: upcoming.session.estimatedMinutes,
              })}
            </Text>
          </View>
        </Card>
      ) : null}

      <Animated.View
        entering={FadeInDown.delay(STEP_MS * 7).duration(400)}
        style={[styles.row, { gap: spacing.sm, paddingHorizontal: spacing.xs }]}
      >
        <Icon name="bell" size={18} color="textMuted" />
        <Text variant="captionStrong" color="textMuted" style={styles.flex}>
          {reminderMinutes === undefined
            ? t('onboarding.summary.remindersOff')
            : t('onboarding.summary.remindersOn', { time: formatTime(reminderMinutes) })}
        </Text>
      </Animated.View>
    </Screen>
  );
}

type TileProps = { delay: number; caption: string; value: string; detail?: string };

/** One of two cards side by side: what it is, its value large, and a detail. */
function Tile({ delay, caption, value, detail }: TileProps) {
  const { spacing } = useTheme();
  return (
    <View style={styles.flex}>
      <Card
        entering={FadeInDown.delay(delay).duration(400)}
        style={[styles.flex, { gap: spacing.xs }]}
      >
        <Caption>{caption}</Caption>
        <Text variant="headline">{value}</Text>
        {detail ? (
          <Text variant="caption" color="textMuted">
            {detail}
          </Text>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wrap: {
    flexWrap: 'wrap',
  },
  // Side by side and as tall as the taller one.
  tiles: {
    flexDirection: 'row',
  },
  flex: {
    flex: 1,
  },
});
