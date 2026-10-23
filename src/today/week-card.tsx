import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { FadeInDown } from 'react-native-reanimated';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { isoWeekday, toIsoDate, useWeekdayFormat } from '@/i18n/dates';
import { range } from '@/lib/math';
import { StreakBadge } from '@/streak/streak-badge';
import type { Streak } from '@/streak/streak';
import { fonts, useTheme } from '@/theme';

const RING_SIZE = 32;
const REST_SIZE = 8;

type WeekCardProps = {
  today: Date;
  streak: Streak;
  /** ISO weekdays of the plan's workouts, 1 for Monday to 7 for Sunday. */
  trainingDays: readonly number[];
  /**
   * The dates as YYYY-MM-DD of the workouts finished this week. Days are counted, not workouts, so
   * that two workouts on one day do not pass the plan.
   */
  finished: readonly string[];
};

type DayKind = 'done' | 'today' | 'planned' | 'missed' | 'rest';

/**
 * Today's date, the streak and the week from Monday to Sunday: a ring for each workout day that
 * is ticked once a workout is finished, and a dot for each rest day.
 */
export function WeekCard({ today, streak, trainingDays, finished }: WeekCardProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const weekdayName = useWeekdayFormat('short');
  const todayWeekday = isoWeekday(today);
  const trainedOn = new Set(finished);
  const day = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(today);

  return (
    <Card entering={FadeInDown.duration(400)}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="headline" accessibilityRole="header">
            {day}
          </Text>
          {trainingDays.length > 0 ? (
            <Text variant="caption" color="textMuted" style={styles.bold}>
              {t('today.week.progress', { done: trainedOn.size, count: trainingDays.length })}
            </Text>
          ) : null}
        </View>
        <StreakBadge streak={streak} />
      </View>
      <View style={styles.week}>
        {range(1, 7).map((weekday) => {
          const date = new Date(today);
          date.setDate(today.getDate() + weekday - todayWeekday);
          const isToday = weekday === todayWeekday;
          const kind: DayKind = trainedOn.has(toIsoDate(date))
            ? 'done'
            : !trainingDays.includes(weekday)
              ? 'rest'
              : isToday
                ? 'today'
                : weekday < todayWeekday
                  ? 'missed'
                  : 'planned';
          const label = [
            `${weekdayName(weekday)} ${date.getDate()}`,
            kind === 'rest' ? null : t(`today.week.${kind === 'today' ? 'planned' : kind}`),
          ]
            .filter(Boolean)
            .join(', ');

          return (
            <View
              key={weekday}
              accessible
              accessibilityLabel={label}
              accessibilityState={{ selected: isToday }}
              style={styles.day}
            >
              <View style={styles.mark}>
                {kind === 'rest' ? (
                  <View style={[styles.rest, { backgroundColor: colors.track }]} />
                ) : (
                  <View
                    testID={`workout-${kind}`}
                    style={[
                      styles.ring,
                      kind === 'done'
                        ? { backgroundColor: colors.primaryButton }
                        : kind === 'today'
                          ? { borderWidth: 3, borderColor: colors.primaryButton }
                          : kind === 'planned'
                            ? { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.planned }
                            : { borderWidth: 2, borderColor: colors.border },
                    ]}
                  >
                    {kind === 'done' ? <Icon name="check" size={16} color="onPrimary" /> : null}
                  </View>
                )}
              </View>
              <Text
                variant="caption"
                color={isToday ? 'primaryText' : 'textMuted'}
                style={isToday ? styles.today : styles.bold}
              >
                {weekdayName(weekday)}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flex: {
    flex: 1,
  },
  bold: {
    fontFamily: fonts.bold,
  },
  today: {
    fontFamily: fonts.extraBold,
  },
  week: {
    flexDirection: 'row',
  },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  mark: {
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rest: {
    width: REST_SIZE,
    height: REST_SIZE,
    borderRadius: REST_SIZE / 2,
  },
});
