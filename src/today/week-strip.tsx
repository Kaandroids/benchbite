import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import { isoWeekday, toIsoDate, useWeekdayFormat } from '@/i18n/dates';
import { range } from '@/lib/math';
import type { DayStatus } from '@/streak/streak';
import { useTheme } from '@/theme';

const MARK_SIZE = 36;
/** The flame and snowflake reach a little past the mark, so they read as big as the number. */
const SHAPE_SIZE = 40;
// Each shape with the view box that centres it.
const FLAME = {
  viewBox: '5.75 2.5 12.5 15',
  d: 'M12 2.5c.8 3.2 4.8 5.4 4.8 10.2a4.8 4.8 0 0 1-9.6 0c0-2.3 1.1-3.8 2.3-4.9.1 1.9 1 3.1 2.2 3.4-.4-3.2-.4-5.8.3-8.7z',
};
const SNOWFLAKE =
  'M18 3v30M5 10.5l26 15M31 10.5l-26 15M13 4.5l5 4 5-4M13 31.5l5-4 5 4M3.5 15.5l6.4-1-2.3-6M32.5 20.5l-6.4 1 2.3 6M32.5 15.5l-6.4-1 2.3-6M3.5 20.5l6.4 1-2.3 6';

type WeekStripProps = {
  today: Date;
  /** How the past days counted for the streak, by their date as YYYY-MM-DD. */
  days: Record<string, DayStatus>;
};

/**
 * The current week from Monday to Sunday with today highlighted. A flame behind a past day shows
 * that it kept the streak going, a snowflake that it was frozen.
 */
export function WeekStrip({ today, days }: WeekStripProps) {
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
        const status = isToday ? undefined : days[toIsoDate(date)];
        return (
          <View
            key={weekday}
            accessible
            accessibilityLabel={`${weekdayName(weekday)} ${date.getDate()}${
              status ? `, ${t(`streak.${status}`)}` : ''
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
            <View style={styles.mark}>
              {status ? (
                <Svg
                  width={SHAPE_SIZE}
                  height={SHAPE_SIZE}
                  viewBox={status === 'done' ? FLAME.viewBox : '0 0 36 36'}
                  style={styles.shape}
                  testID={`streak-${status}`}
                >
                  {status === 'done' ? (
                    <Path d={FLAME.d} fill={colors.streakDay} />
                  ) : (
                    <Path
                      d={SNOWFLAKE}
                      fill="none"
                      stroke={colors.frozen}
                      strokeWidth={2.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </Svg>
              ) : null}
              <Text variant="bodyStrong" color={isToday ? 'onPrimary' : 'text'}>
                {date.getDate()}
              </Text>
            </View>
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
  mark: {
    width: MARK_SIZE,
    height: MARK_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shape: {
    position: 'absolute',
    top: (MARK_SIZE - SHAPE_SIZE) / 2,
    left: (MARK_SIZE - SHAPE_SIZE) / 2,
  },
});
