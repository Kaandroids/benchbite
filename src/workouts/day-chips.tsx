import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useWeekdayFormat } from '@/i18n/dates';
import { fonts, useTheme } from '@/theme';

type DayChipsProps = {
  /** ISO weekdays, 1 for Monday to 7 for Sunday; none means any day. */
  weekdays: number[];
  /** Grey instead of in colour, for inactive workouts. */
  muted?: boolean;
  /** Today's ISO weekday, whose chip is filled to stand out. */
  today?: number;
};

/** The weekdays of a workout as small labels, or "Any day" if it has none. */
export function DayChips({ weekdays, muted = false, today }: DayChipsProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const weekdayName = useWeekdayFormat('short');
  const days =
    weekdays.length > 0
      ? weekdays.map((weekday) => ({ label: weekdayName(weekday), isToday: weekday === today }))
      : [{ label: t('workout.anyDay'), isToday: false }];

  return (
    <View style={[styles.row, { gap: spacing.xs }]}>
      {days.map(({ label, isToday }) => {
        // In the breakfast colours, so that the days don't add to the orange of the list (#334).
        const filled = isToday && !muted;
        return (
          <View
            key={label}
            accessible={isToday}
            accessibilityLabel={isToday ? t('workout.dayToday', { day: label }) : undefined}
            style={[
              styles.chip,
              {
                borderRadius: radii.sm,
                backgroundColor: muted
                  ? colors.track
                  : filled
                    ? colors.breakfast
                    : colors.breakfastBackground,
              },
            ]}
          >
            <Text
              variant={filled ? 'captionStrong' : 'caption'}
              color={muted ? 'textMuted' : filled ? 'onPrimary' : 'breakfast'}
              style={filled ? null : styles.label}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  label: {
    fontFamily: fonts.bold,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
});
