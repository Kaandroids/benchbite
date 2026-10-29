import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import {
  addDays,
  fromIsoDate,
  toIsoDate,
  useMonthFormat,
  useWeekdayFormat,
  weekStart,
} from '@/i18n/dates';
import { fonts, useTheme, type ColorTokens } from '@/theme';
import { heatLevel, type DayTraining } from '@/workouts/day-training';

const MAX_CELL = 22;
/** Below this size a cell has no room for the weekdays beside its rows. */
const LABELED_CELL = 12;
const WEEKDAY_WIDTH = 30;
const MONTH_HEIGHT = 16;
/** The least room between two month names along the top. */
const MONTH_WIDTH = 30;

/** The days of no workout to the longest, as the heat map shades them. */
export const HEAT_COLORS: readonly (keyof ColorTokens)[] = [
  'track',
  'heat1',
  'heat2',
  'heat3',
  'heat4',
];

type HeatMapProps = {
  /** Each day from the first shown, as day_training() gives them. */
  days: readonly DayTraining[];
  today: Date;
  /** What screen readers say of the whole map. */
  accessibilityLabel: string;
};

/**
 * The days as a heat map (ADR 0047): a column for each week, Monday on top, each day darker the
 * longer it was trained, a day with a planned workout missed outlined in red, and today outlined.
 */
export function HeatMap({ days, today, accessibilityLabel }: HeatMapProps) {
  const { colors } = useTheme();
  const weekday = useWeekdayFormat('short');
  const monthName = useMonthFormat();
  const [width, setWidth] = useState(0);

  const first = days[0] ? fromIsoDate(days[0].day) : today;
  const firstWeek = weekStart(first);
  const weeks =
    Math.floor((weekStart(today).getTime() - firstWeek.getTime()) / (7 * 86_400_000)) + 1;
  const byDay = new Map(days.map((day) => [day.day, day]));
  const firstDay = toIsoDate(first);
  const todayDay = toIsoDate(today);

  // Cells as large as the width allows, up to a size that keeps the map short; weekdays only beside
  // cells tall enough for them.
  const roomy = (width - WEEKDAY_WIDTH) / weeks - 3 >= LABELED_CELL;
  const column = (width - (roomy ? WEEKDAY_WIDTH : 0)) / weeks;
  const gap = column >= 14 ? 3 : 1;
  const cell = Math.max(0, Math.min(column - gap, MAX_CELL));
  const pitch = cell + gap;

  // A month's name over the week it starts in, the first week's over it too, where there is room.
  const months: { x: number; name: string }[] = [];
  for (let week = 0; week < weeks; week++) {
    const monday = addDays(firstWeek, week * 7);
    const start = [0, 1, 2, 3, 4, 5, 6]
      .map((offset) => addDays(monday, offset))
      .find((date) => date.getDate() === 1 && toIsoDate(date) >= firstDay && date <= today);
    const x = week * pitch;
    if ((week === 0 || start) && x - (months.at(-1)?.x ?? -MONTH_WIDTH) >= MONTH_WIDTH) {
      months.push({ x, name: monthName(start ?? first) });
    }
  }

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <View style={styles.row}>
          {roomy ? (
            <View style={[styles.weekdays, { width: WEEKDAY_WIDTH, gap }]}>
              {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                <Text
                  key={day}
                  color="textMuted"
                  style={[styles.label, { height: cell, lineHeight: cell }]}
                >
                  {day % 2 === 1 ? weekday(day) : ''}
                </Text>
              ))}
            </View>
          ) : null}
          <View>
            <View style={{ height: MONTH_HEIGHT }}>
              {months.map((month) => (
                <Text
                  key={month.x}
                  color="textMuted"
                  style={[styles.label, styles.month, { left: month.x }]}
                >
                  {month.name}
                </Text>
              ))}
            </View>
            <Svg width={weeks * pitch} height={7 * pitch}>
              {Array.from({ length: weeks * 7 }, (_, index) => {
                const date = addDays(firstWeek, index);
                const key = toIsoDate(date);
                if (key < firstDay) {
                  return null;
                }
                const day = byDay.get(key);
                const x = Math.floor(index / 7) * pitch;
                const y = (index % 7) * pitch;
                const later = key > todayDay;
                const missed = !later && (day?.missed ?? 0) > 0;
                // A stroke is drawn on the cell's edge, so it is inset by half its width.
                const inset = missed || key === todayDay ? 1 : 0;
                return (
                  <Rect
                    key={key}
                    x={x + inset}
                    y={y + inset}
                    width={cell - 2 * inset}
                    height={cell - 2 * inset}
                    rx={Math.min(4, cell / 4)}
                    fill={
                      later ? colors.background : colors[HEAT_COLORS[heatLevel(day?.minutes ?? 0)]!]
                    }
                    stroke={missed ? colors.danger : key === todayDay ? colors.text : undefined}
                    strokeWidth={inset ? 1.5 : 0}
                    strokeDasharray={missed ? '3 2' : undefined}
                  />
                );
              })}
            </Svg>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  weekdays: {
    marginTop: MONTH_HEIGHT,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 10,
  },
  month: {
    position: 'absolute',
    top: 0,
    lineHeight: 13,
  },
});
