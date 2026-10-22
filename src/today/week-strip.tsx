import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { isoWeekday, toIsoDate, useWeekdayFormat } from '@/i18n/dates';
import { range } from '@/lib/math';
import type { DayStatus } from '@/streak/streak';
import { fonts, useTheme, type ColorTokens } from '@/theme';

const MARK_SIZE = 38;
const BADGE_SIZE = 18;

type WeekStripProps = {
  today: Date;
  /** How the past days counted for the streak, by their date as YYYY-MM-DD. */
  days: Record<string, DayStatus>;
  /** ISO weekdays of the plan's workouts, 1 for Monday to 7 for Sunday. */
  trainingDays: readonly number[];
  /** Dates as YYYY-MM-DD on which a workout was finished. */
  trainedOn: ReadonlySet<string>;
};

/**
 * The current week from Monday to Sunday with today highlighted. Past days show whether they kept
 * the streak or were frozen, and a dot under each workout day shows whether it was done, missed
 * or is still ahead.
 */
export function WeekStrip({ today, days, trainingDays, trainedOn }: WeekStripProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const weekdayName = useWeekdayFormat('short');
  const todayWeekday = isoWeekday(today);

  return (
    <View style={[styles.row, { gap: spacing.xs }]}>
      {range(1, 7).map((weekday) => {
        const date = new Date(today);
        date.setDate(today.getDate() + weekday - todayWeekday);
        const isoDate = toIsoDate(date);
        const isToday = weekday === todayWeekday;
        const status = isToday ? undefined : days[isoDate];
        const workout = !trainingDays.includes(weekday)
          ? undefined
          : trainedOn.has(isoDate)
            ? 'done'
            : weekday < todayWeekday
              ? 'missed'
              : 'planned';
        const dotColor: keyof ColorTokens | undefined =
          workout === 'done'
            ? 'primary'
            : workout === 'missed'
              ? 'textMuted'
              : workout && 'planned';
        const label = [
          `${weekdayName(weekday)} ${date.getDate()}`,
          status && t(`streak.${status}`),
          workout && t(`today.week.${workout}`),
        ]
          .filter(Boolean)
          .join(', ');

        return (
          <View
            key={weekday}
            accessible
            accessibilityLabel={label}
            accessibilityState={{ selected: isToday }}
            style={[
              styles.day,
              {
                gap: spacing.xs,
                paddingVertical: spacing.sm,
                borderRadius: radii.md,
                backgroundColor: isToday ? colors.primary : 'transparent',
              },
            ]}
          >
            <Text
              variant="caption"
              color={isToday ? 'onPrimary' : 'textMuted'}
              style={isToday ? styles.todayName : undefined}
            >
              {weekdayName(weekday)}
            </Text>
            <View
              style={[
                styles.mark,
                {
                  backgroundColor:
                    status === 'done'
                      ? colors.primaryButton
                      : status === 'frozen'
                        ? colors.frozenBackground
                        : 'transparent',
                },
              ]}
            >
              <Text
                variant={isToday ? 'headline' : 'bodyStrong'}
                color={
                  isToday || status === 'done'
                    ? 'onPrimary'
                    : status === 'frozen'
                      ? 'frozen'
                      : 'text'
                }
              >
                {date.getDate()}
              </Text>
              {status ? (
                <View
                  testID={`streak-${status}`}
                  style={[styles.badge, { backgroundColor: colors.background }]}
                >
                  <Icon
                    name={status === 'done' ? 'flame' : 'snowflake'}
                    size={12}
                    color={status === 'done' ? 'primary' : 'frozen'}
                  />
                </View>
              ) : null}
            </View>
            <View
              testID={workout && `workout-${workout}`}
              style={[styles.dot, { backgroundColor: dotColor ? colors[dotColor] : 'transparent' }]}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  day: {
    flex: 1,
    alignItems: 'center',
  },
  todayName: {
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  mark: {
    width: MARK_SIZE,
    height: MARK_SIZE,
    borderRadius: MARK_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
