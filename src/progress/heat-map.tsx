import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import type { DayTraining } from '@/history/day-training';
import {
  addDays,
  daysBetween,
  fromIsoDate,
  toIsoDate,
  useMonthFormat,
  useWeekdayFormat,
  weekStart,
} from '@/i18n/dates';
import { fonts, useTheme, type ColorTokens } from '@/theme';

/** How many weeks fit the map's width; longer ranges scroll back from today. */
const SHOWN_WEEKS = 13;
const MAX_PITCH = 26;
const GAP = 3;
const WEEKDAY_WIDTH = 30;
const MONTH_HEIGHT = 16;
/** The least room between two month names along the top. */
const MONTH_WIDTH = 30;

/**
 * The shades of a day, by the minutes trained: none, then from 1, 30, 60 and 90 minutes
 * (ADR 0047).
 */
const HEAT: readonly { from: number; color: keyof ColorTokens }[] = [
  { from: 0, color: 'track' },
  { from: 1, color: 'heat1' },
  { from: 30, color: 'heat2' },
  { from: 60, color: 'heat3' },
  { from: 90, color: 'heat4' },
];

/** The shade of a day trained for `minutes`. */
export function heatColor(minutes: number): keyof ColorTokens {
  return HEAT.findLast((shade) => minutes >= shade.from)!.color;
}

/** The outline of a day with a planned workout missed, in the map and its legend. */
function useMissedStroke() {
  const { colors } = useTheme();
  return { stroke: colors.danger, strokeWidth: 1.5, strokeDasharray: '3 2' };
}

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
 * Three months fill the width; a longer range opens on today and scrolls back to its start.
 */
export function HeatMap({ days, today, accessibilityLabel }: HeatMapProps) {
  const { colors } = useTheme();
  const missedStroke = useMissedStroke();
  const weekday = useWeekdayFormat('short');
  const monthName = useMonthFormat();
  const [width, setWidth] = useState(0);
  const scroll = useRef<ScrollViewInstance>(null);

  const first = days[0] ? fromIsoDate(days[0].day) : today;
  const firstWeek = weekStart(first);
  // By calendar days, as a clock change makes a week an hour short or long.
  const weeks = daysBetween(firstWeek, weekStart(today)) / 7 + 1;
  const byDay = new Map(days.map((day) => [day.day, day]));
  const firstDay = toIsoDate(first);
  const todayDay = toIsoDate(today);

  const pitch = Math.min((width - WEEKDAY_WIDTH) / SHOWN_WEEKS, MAX_PITCH);
  const cell = Math.max(0, pitch - GAP);

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
          <View style={[styles.weekdays, { width: WEEKDAY_WIDTH, gap: GAP }]}>
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
          <ScrollView
            ref={scroll}
            horizontal
            showsHorizontalScrollIndicator={weeks > SHOWN_WEEKS}
            // Open on today, also after the range changes.
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
          >
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
                  const later = key > todayDay;
                  const missed = !later && (day?.missed ?? 0) > 0;
                  // A stroke is drawn on the cell's edge, so it is inset by half its width.
                  const inset = missed || key === todayDay ? 1 : 0;
                  return (
                    <Rect
                      key={key}
                      x={Math.floor(index / 7) * pitch + inset}
                      y={(index % 7) * pitch + inset}
                      width={cell - 2 * inset}
                      height={cell - 2 * inset}
                      rx={4}
                      fill={later ? colors.background : colors[heatColor(day?.minutes ?? 0)]}
                      {...(missed
                        ? missedStroke
                        : key === todayDay
                          ? { stroke: colors.text, strokeWidth: 1.5 }
                          : {})}
                    />
                  );
                })}
              </Svg>
            </View>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

/** What the heat map's shades and outlines stand for, hidden from screen readers. */
export function HeatMapLegend() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const missedStroke = useMissedStroke();
  return (
    <View
      style={[styles.row, styles.legend, { gap: spacing.xs }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Text variant="caption" color="textMuted">
        {t('progress.training.less')}
      </Text>
      {HEAT.map(({ color }) => (
        <View key={color} style={[styles.swatch, { backgroundColor: colors[color] }]} />
      ))}
      <Text variant="caption" color="textMuted">
        {t('progress.training.more')}
      </Text>
      <View style={styles.flex} />
      <Svg width={12} height={12}>
        <Rect x={0.75} y={0.75} width={10.5} height={10.5} rx={3} fill="none" {...missedStroke} />
      </Svg>
      <Text variant="caption" color="textMuted">
        {t('progress.training.missed')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  flex: {
    flex: 1,
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
  legend: {
    alignItems: 'center',
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
});
