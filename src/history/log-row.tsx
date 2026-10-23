import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useWeekdayFormat } from '@/i18n/dates';
import { fonts, useTheme, type ColorTokens } from '@/theme';
import { useWorkoutName } from '@/workouts/format';

import { useDurationFormat } from './format';
import { durationMinutes, type LogSummary } from './history';

function Stat({ icon, color, text }: { icon: IconName; color: keyof ColorTokens; text: string }) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={13} color={color} />
      <Text variant="caption" color="textMuted" style={styles.semibold}>
        {text}
      </Text>
    </View>
  );
}

/** A finished workout in a list: its day, name, length, sets and calories. Opens the workout. */
export function LogRow({ log, divider }: { log: LogSummary; divider: boolean }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const weekday = useWeekdayFormat('short');
  const workoutName = useWorkoutName();
  const duration = useDurationFormat();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t('history.open')}
      onPress={() => router.push({ pathname: '/workout/log/[id]', params: { id: String(log.id) } })}
      style={({ pressed }) => [
        styles.row,
        {
          gap: spacing.md,
          borderTopWidth: divider ? 1 : 0,
          borderTopColor: colors.border,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <View style={[styles.date, { borderRadius: radii.md, backgroundColor: colors.selected }]}>
        <Text variant="caption" color="primaryText" style={[styles.bold, styles.weekday]}>
          {weekday(log.startedAt.getDay() || 7).toLocaleUpperCase()}
        </Text>
        <Text variant="headline" style={styles.day}>
          {log.startedAt.getDate()}
        </Text>
      </View>
      <View style={[styles.flex, { gap: 2 }]}>
        <Text variant="bodyStrong" numberOfLines={1} style={styles.bold}>
          {workoutName(log)}
        </Text>
        <View style={[styles.stats, { gap: spacing.md }]}>
          <Stat icon="timer" color="primaryText" text={duration(durationMinutes(log))} />
          <Stat icon="dumbbell" color="info" text={t('history.sets', { count: log.sets })} />
          {log.estimatedKcal !== null ? (
            <Stat
              icon="flame"
              color="primary"
              text={t('history.kcal', { kcal: log.estimatedKcal })}
            />
          ) : null}
        </View>
      </View>
      <Icon name="forward" size={18} color="textMuted" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  flex: {
    flex: 1,
  },
  bold: {
    fontFamily: fonts.extraBold,
  },
  semibold: {
    fontFamily: fonts.bold,
  },
  date: {
    width: 48,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekday: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.4,
  },
  day: {
    lineHeight: 24,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
