import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { useShortDateFormat } from '@/i18n/dates';
import { fonts, useTheme } from '@/theme';

const HEIGHT = 150;
const TOP = 28;
const BOTTOM = 26;
const AXIS = 40;
const END = 8;

export type ChartPoint = { date: Date; value: number };

/** How values step on the axis: by any round number, by whole numbers, or by round times. */
export type Scale = 'decimal' | 'whole' | 'time';

// Round steps of a time axis in seconds; longer ones are whole minutes.
const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

type ProgressChartProps = {
  points: readonly ChartPoint[];
  /** The value with its unit, above the last point and in the description. */
  formatValue: (value: number) => string;
  /** The short number on the axis. */
  formatTick: (value: number) => string;
  scale: Scale;
  /** Draws lower values higher, for a metric where lower is better. */
  inverted?: boolean;
  /** Says what the chart shows, in a sentence for screen readers. */
  description: string;
  /** A value to reach, drawn as a dashed line with its label over it. */
  target?: { value: number; label: string };
  /** Places the points by their dates rather than evenly, for values logged now and then. */
  byDate?: boolean;
  /** False where the last value shows beside the chart already. */
  labelLast?: boolean;
};

/** Up to how many points each get a dot; more are only the line, with a dot on the last. */
const DOTTED_POINTS = 20;

/**
 * The smallest round step that is at least `step`: 1, 2, 2.5 or 5 times a power of ten, without
 * 2.5 below ten on a whole scale, or a round time.
 */
export function niceStep(step: number, scale: Scale): number {
  if (scale === 'time') {
    return TIME_STEPS.find((nice) => nice >= step) ?? 60 * niceStep(step / 60, 'whole');
  }
  if (step <= 0) {
    return 1;
  }
  const power = 10 ** Math.floor(Math.log10(step));
  const nice =
    [1, 2, 2.5, 5, 10]
      .map((factor) => factor * power)
      .filter((candidate) => scale === 'decimal' || Number.isInteger(candidate))
      .find((candidate) => candidate >= step - 1e-9) ?? 10 * power;
  return scale === 'whole' ? Math.max(1, nice) : nice;
}

/** Round values on the axis around the lowest and the highest, about three of them. */
export function ticksOf(values: readonly number[], scale: Scale): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A single value sits in the middle, a step from the lines above and below it.
  const step = niceStep((max - min) / 2 || Math.max(1, Math.abs(max) / 10), scale);
  const below = Math.floor((min === max ? min - step : min) / step) * step;
  // Not below zero for values that cannot be negative, such as a small weight or distance.
  const low = min >= 0 ? Math.max(0, below) : below;
  const high = Math.ceil((min === max ? max + step : max) / step) * step;
  const ticks: number[] = [];
  for (let tick = low; tick <= high + step / 2; tick += step) {
    ticks.push(Number(tick.toFixed(6)));
  }
  return ticks;
}

/**
 * A value's progress as a line, oldest on the left: an exercise's over its workouts, evenly
 * spaced, or the weight over its days.
 */
export function ProgressChart({
  points,
  formatValue,
  formatTick,
  scale,
  inverted = false,
  description,
  target,
  byDate = false,
  labelLast = true,
}: ProgressChartProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const day = useShortDateFormat(new Date());

  const ticks = ticksOf(
    [...points.map((point) => point.value), ...(target ? [target.value] : [])],
    scale,
  );
  const low = ticks[0] ?? 0;
  const high = ticks[ticks.length - 1] ?? low + 1;
  const y = (value: number) => {
    const share = (value - low) / (high - low);
    return TOP + (inverted ? share : 1 - share) * (HEIGHT - TOP - BOTTOM);
  };
  const right = width - END;
  const first = points[0]?.date.getTime() ?? 0;
  const span = (points[points.length - 1]?.date.getTime() ?? 0) - first;
  const x = (index: number) =>
    points.length === 1
      ? (AXIS + right) / 2
      : byDate && span > 0
        ? AXIS + (((points[index]?.date.getTime() ?? first) - first) * (right - AXIS)) / span
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
      accessibilityLabel={description}
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
          {target ? (
            <>
              <Line
                x1={AXIS}
                x2={width}
                y1={y(target.value)}
                y2={y(target.value)}
                stroke={colors.success}
                strokeWidth={1.5}
                strokeDasharray="5 5"
              />
              <SvgText
                x={width}
                y={y(target.value) + (inverted ? 14 : -5)}
                textAnchor="end"
                {...font}
                fontFamily={fonts.extraBold}
                fill={colors.success}
              >
                {target.label}
              </SvgText>
            </>
          ) : null}
          {labelled.map((index) => (
            <SvgText
              key={index}
              x={x(index)}
              y={HEIGHT - 6}
              textAnchor={
                points.length === 1
                  ? 'middle'
                  : index === 0
                    ? 'start'
                    : index === points.length - 1
                      ? 'end'
                      : 'middle'
              }
              {...font}
            >
              {day(points[index]?.date ?? last.date)}
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
          {points.map((point, index) =>
            points.length > DOTTED_POINTS && index < points.length - 1 ? null : (
              <Circle
                key={index}
                cx={x(index)}
                cy={y(point.value)}
                r={index === points.length - 1 ? 5 : 4}
                fill={colors.primary}
                stroke={colors.surface}
                strokeWidth={2}
              />
            ),
          )}
          {(labelLast ? [true, false] : []).map((halo) => (
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
