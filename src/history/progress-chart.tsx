import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { fonts, useTheme } from '@/theme';

const HEIGHT = 150;
const TOP = 28;
const BOTTOM = 26;
const AXIS = 40;
const END = 8;

export type ChartPoint = { date: Date; value: number };

type ProgressChartProps = {
  points: readonly ChartPoint[];
  /** The value with its unit, above the last point and in the description. */
  formatValue: (value: number) => string;
  /** The short number on the axis. */
  formatTick: (value: number) => string;
  /** Draws lower values higher, for a metric where lower is better. */
  inverted?: boolean;
  /** Says what the chart shows, for screen readers. */
  label: string;
};

/** The smallest of 1, 2, 2.5 and 5 times a power of ten that is at least `step`. */
export function niceStep(step: number): number {
  if (step <= 0) {
    return 1;
  }
  const power = 10 ** Math.floor(Math.log10(step));
  return (
    [1, 2, 2.5, 5, 10].map((factor) => factor * power).find((nice) => nice >= step - 1e-9) ??
    10 * power
  );
}

/** Round values on the axis around the lowest and the highest, about three of them. */
export function ticksOf(values: readonly number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A single value sits in the middle, a step from the lines above and below it.
  const step = niceStep((max - min) / 2 || Math.max(1, Math.abs(max) / 10));
  const low = Math.floor((min === max ? min - step : min) / step) * step;
  const high = Math.ceil((min === max ? max + step : max) / step) * step;
  const ticks: number[] = [];
  for (let tick = low; tick <= high + step / 2; tick += step) {
    ticks.push(Number(tick.toFixed(6)));
  }
  return ticks;
}

/** An exercise's progress as a line over its workouts, oldest on the left, evenly spaced. */
export function ProgressChart({
  points,
  formatValue,
  formatTick,
  inverted = false,
  label,
}: ProgressChartProps) {
  const { i18n } = useTranslation();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const day = new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' });

  const ticks = ticksOf(points.map((point) => point.value));
  const low = ticks[0] ?? 0;
  const high = ticks[ticks.length - 1] ?? low + 1;
  const y = (value: number) => {
    const share = (value - low) / (high - low);
    return TOP + (inverted ? share : 1 - share) * (HEIGHT - TOP - BOTTOM);
  };
  const right = width - END;
  const x = (index: number) =>
    points.length === 1
      ? (AXIS + right) / 2
      : AXIS + (index * (right - AXIS)) / (points.length - 1);
  // The first and the last day, and the middle one when there is room between them.
  const labelled = [
    0,
    ...(points.length >= 5 ? [Math.floor((points.length - 1) / 2)] : []),
    points.length - 1,
  ].filter((index, position, all) => all.indexOf(index) === position);
  const last = points[points.length - 1];
  const before = points[points.length - 2];
  // The last value goes above its point, or left of it when the line comes down from above; a
  // halo keeps it apart from the line either way.
  const lastY = last ? y(last.value) : 0;
  const fromAbove = before !== undefined && y(before.value) < lastY;
  const valueAt = fromAbove
    ? { x: x(points.length - 1) - 12, y: lastY + 5 }
    : { x: x(points.length - 1), y: lastY - 12 };
  const font = { fontFamily: fonts.bold, fontSize: 11, fill: colors.textMuted };

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${label}: ${points
        .map((point) => `${day.format(point.date)} ${formatValue(point.value)}`)
        .join(', ')}`}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ height: HEIGHT }}
    >
      {width > 0 && last ? (
        <Svg width={width} height={HEIGHT}>
          {ticks.map((tick) => (
            <Line
              key={tick}
              x1={AXIS}
              x2={width}
              y1={y(tick)}
              y2={y(tick)}
              stroke={colors.track}
              strokeWidth={1}
            />
          ))}
          {ticks.map((tick) => (
            <SvgText key={tick} x={0} y={y(tick) + 4} {...font}>
              {formatTick(tick)}
            </SvgText>
          ))}
          {labelled.map((index) => (
            <SvgText
              key={index}
              x={x(index)}
              y={HEIGHT - 6}
              textAnchor={index === points.length - 1 && points.length > 1 ? 'end' : 'middle'}
              {...font}
            >
              {day.format(points[index]?.date ?? last.date)}
            </SvgText>
          ))}
          {points.length > 1 ? (
            <Polyline
              points={points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ')}
              fill="none"
              stroke={colors.primary}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {points.map((point, index) => (
            <Circle
              key={index}
              cx={x(index)}
              cy={y(point.value)}
              r={index === points.length - 1 ? 5 : 4}
              fill={colors.primary}
              stroke={colors.surface}
              strokeWidth={2}
            />
          ))}
          {[true, false].map((halo) => (
            <SvgText
              key={String(halo)}
              x={valueAt.x}
              y={valueAt.y}
              textAnchor={points.length > 1 ? 'end' : 'middle'}
              fontFamily={fonts.black}
              fontSize={13}
              fill={colors.text}
              stroke={halo ? colors.surface : undefined}
              strokeWidth={halo ? 4 : 0}
              strokeLinejoin="round"
            >
              {formatValue(last.value)}
            </SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
