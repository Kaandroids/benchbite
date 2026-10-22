import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { isoWeekday, useWeekdayFormat } from '@/i18n/dates';
import { range } from '@/lib/math';
import { useTheme } from '@/theme';

type WeekStripProps = {
  today: Date;
  /** ISO weekdays with a workout, 1 for Monday to 7 for Sunday. */
  trainingDays: readonly number[];
};

/** The current week from Monday to Sunday, with today highlighted and the training days marked. */
export function WeekStrip({ today, trainingDays }: WeekStripProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const weekdayName = useWeekdayFormat('short');
  const todayWeekday = isoWeekday(today);

  return (
    <View style={[styles.row, { gap: spacing.xs }]}>
      {range(1, 7).map((weekday) => {
        const date = new Date(today);
        date.setDate(today.getDate() + weekday - todayWeekday);
        const isToday = weekday === todayWeekday;
        const trains = trainingDays.includes(weekday);
        return (
          <View
            key={weekday}
            accessible
            accessibilityLabel={`${weekdayName(weekday)} ${date.getDate()}${
              trains ? `, ${t('today.week.workout')}` : ''
            }`}
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
            <Text variant="caption" color={isToday ? 'onPrimary' : 'textMuted'}>
              {weekdayName(weekday)}
            </Text>
            <Text variant="bodyStrong" color={isToday ? 'onPrimary' : 'text'}>
              {date.getDate()}
            </Text>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor: trains
                    ? isToday
                      ? colors.onPrimary
                      : colors.primary
                    : 'transparent',
                },
              ]}
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
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
