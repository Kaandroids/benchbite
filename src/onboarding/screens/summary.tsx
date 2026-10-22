import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTimeFormat, useWeekdayFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { nextSession } from '@/plan/next-session';
import { useTheme } from '@/theme';

import { useStep } from '../use-step';

/**
 * The end of the onboarding: a short celebration, what was set up, and the first workout.
 * Everything is already saved, so there is no way back; continuing opens the app.
 */
export function SummaryStep() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const weekdayName = useWeekdayFormat();
  const formatTime = useTimeFormat();
  const { answers, progress, next } = useStep('summary');
  const { targets, plan, reminderMinutes } = answers;
  const upcoming = plan ? nextSession(plan, new Date()) : null;

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const rows: { icon: IconName; label: string }[] = [
    ...(targets
      ? [
          {
            icon: 'flame' as const,
            label: t('nutrition.calories', { calories: format(targets.calories) }),
          },
        ]
      : []),
    ...(plan
      ? [
          {
            icon: 'dumbbell' as const,
            label: t('onboarding.summary.workouts', { count: plan.sessions.length }),
          },
        ]
      : []),
    {
      icon: 'bell',
      label:
        reminderMinutes === undefined
          ? t('onboarding.summary.remindersOff')
          : t('onboarding.summary.remindersOn', { time: formatTime(reminderMinutes) }),
    },
  ];

  return (
    <Screen
      progress={progress}
      footer={<Button label={t('onboarding.summary.start')} onPress={() => next()} />}
    >
      <View style={[styles.hero, { gap: spacing.md, paddingTop: spacing.xl }]}>
        <Animated.View entering={ZoomIn.springify().delay(100)}>
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Icon name="check" size={48} color="onPrimary" />
          </View>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(300).duration(400)} style={{ gap: spacing.sm }}>
          <Text variant="title" align="center">
            {t('onboarding.steps.summary.title')}
          </Text>
          <Text color="textMuted" align="center">
            {t('onboarding.summary.body')}
          </Text>
        </Animated.View>
      </View>

      <Card entering={FadeInDown.delay(450).duration(400)}>
        {rows.map((row) => (
          <View key={row.icon} style={[styles.row, { gap: spacing.md }]}>
            <IconTile name={row.icon} size={40} />
            <Text variant="bodyStrong" style={styles.rowLabel}>
              {row.label}
            </Text>
          </View>
        ))}
      </Card>

      {upcoming ? (
        <Card entering={FadeInDown.delay(600).duration(400)}>
          <Text variant="caption" color="primaryText">
            {t('onboarding.summary.next')}
          </Text>
          <View style={{ gap: 2 }}>
            <Text variant="headline">
              {upcoming.inDays === 0
                ? t('onboarding.summary.today')
                : upcoming.inDays === 1
                  ? t('onboarding.summary.tomorrow')
                  : weekdayName(upcoming.session.weekday)}
              {' · '}
              {t(`workout.sessionTypes.${upcoming.session.type}`)}
            </Text>
            <Text color="textMuted">
              {t('workout.session', {
                count: upcoming.session.exercises.length,
                minutes: upcoming.session.estimatedMinutes,
              })}
            </Text>
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowLabel: {
    flex: 1,
  },
});
